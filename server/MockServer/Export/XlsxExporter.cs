using System.Data;
using MiniExcelLibs;
using MockServer.Data;

namespace MockServer.Export;

internal static class XlsxExporter
{
    public const string ContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /// <summary>
    /// Строки пишутся потоком по одной. MiniExcel берёт заголовок из первой строки, поэтому
    /// пустой результат отдаётся таблицей с одними колонками — иначе файл без заголовка.
    /// </summary>
    public static Task Write(ExportRequest request, IEnumerable<ProductionRecord> rows, Stream output, CancellationToken cancellationToken)
    {
        var enumerator = rows.GetEnumerator();
        if (!enumerator.MoveNext())
        {
            enumerator.Dispose();
            return MiniExcel.SaveAsAsync(output, HeaderOnly(request.Columns), printHeader: true, cancellationToken: cancellationToken);
        }
        return MiniExcel.SaveAsAsync(output, Cells(request.Columns, Rest(enumerator)), printHeader: true, cancellationToken: cancellationToken);
    }

    private static DataTable HeaderOnly(IReadOnlyList<ExportColumn> columns)
    {
        var table = new DataTable();
        foreach (var column in columns)
            table.Columns.Add(column.Caption, typeof(string));
        return table;
    }

    private static IEnumerable<ProductionRecord> Rest(IEnumerator<ProductionRecord> enumerator)
    {
        using (enumerator)
        {
            do yield return enumerator.Current;
            while (enumerator.MoveNext());
        }
    }

    private static IEnumerable<IDictionary<string, object>> Cells(IReadOnlyList<ExportColumn> columns, IEnumerable<ProductionRecord> rows)
    {
        foreach (var row in rows)
        {
            var cells = new Dictionary<string, object>(columns.Count, StringComparer.Ordinal);
            foreach (var column in columns)
                cells[column.Caption] = column.Text(row);
            yield return cells;
        }
    }
}

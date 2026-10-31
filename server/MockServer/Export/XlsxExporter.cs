using MiniExcelLibs;
using MockServer.Data;

namespace MockServer.Export;

internal static class XlsxExporter
{
    public const string ContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    public static Task Write(ExportRequest request, IEnumerable<ProductionRecord> rows, Stream output, CancellationToken cancellationToken) =>
        MiniExcel.SaveAsAsync(output, Cells(request.Columns, rows), printHeader: true, cancellationToken: cancellationToken);

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

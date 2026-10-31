using System.Text.Json;
using DevExtreme.AspNet.Data;
using MockServer.Api;
using MockServer.Data;

namespace MockServer.Export;

internal sealed record ExportColumn(string Caption, ColumnEndpoints.Column Column)
{
    public string Text(ProductionRecord row) => Column.Text(row);
}

internal sealed class ExportRequest
{
    private const string ColumnsHint = "Параметр columns должен быть непустым JSON-массивом [{ field, caption }]";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly int _dataset;
    private readonly DataSourceLoadOptionsBase _options;

    private ExportRequest(IReadOnlyList<ExportColumn> columns, int dataset, DataSourceLoadOptionsBase options)
    {
        Columns = columns;
        _dataset = dataset;
        _options = options;
    }

    public IReadOnlyList<ExportColumn> Columns { get; }

    public static ExportRequest Read(IFormCollection form)
    {
        var columns = ReadColumns(form["columns"]);
        var (dataset, options) = LoadOptionsReader.Read(form);
        options.Sort = (options.Group ?? Array.Empty<GroupingInfo>())
            .Concat(options.Sort ?? Array.Empty<SortingInfo>())
            .Select(s => new SortingInfo { Selector = s.Selector, Desc = s.Desc })
            .ToArray();
        options.Group = null;
        options.GroupSummary = null;
        options.TotalSummary = null;
        options.Select = null;
        options.Skip = 0;
        options.Take = 0;
        options.RequireTotalCount = false;
        options.RequireGroupCount = false;
        return new ExportRequest(columns, dataset, options);
    }

    public IEnumerable<ProductionRecord> Rows(DatasetStore store) =>
        DataSourceLoader.Load(store.Get(_dataset).AsQueryable(), _options).data.Cast<ProductionRecord>();

    private static IReadOnlyList<ExportColumn> ReadColumns(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            throw new BadHttpRequestException(ColumnsHint);

        ColumnSpec?[]? specs;
        try
        {
            specs = JsonSerializer.Deserialize<ColumnSpec?[]>(json, Json);
        }
        catch (JsonException)
        {
            throw new BadHttpRequestException(ColumnsHint);
        }

        if (specs is null || specs.Length == 0)
            throw new BadHttpRequestException(ColumnsHint);

        var columns = specs
            .Select(spec =>
            {
                var column = ColumnEndpoints.FindColumn(spec?.Field, "columns[].field");
                var caption = spec?.Caption;
                return new ExportColumn(string.IsNullOrWhiteSpace(caption) ? column.Field : caption, column);
            })
            .ToArray();
        if (columns.Select(c => c.Caption).Distinct(StringComparer.Ordinal).Count() != columns.Length)
            throw new BadHttpRequestException("Заголовки колонок в columns должны быть уникальными");
        return columns;
    }

    private sealed record ColumnSpec(string? Field, string? Caption);
}

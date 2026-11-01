using System.Globalization;
using System.Threading.RateLimiting;
using DevExtreme.AspNet.Data;
using Microsoft.AspNetCore.RateLimiting;
using MockServer.Data;

namespace MockServer.Api;

public sealed record DistinctItem(object Value, string Text, int Count);
public sealed record DistinctResponse(DistinctItem[] Items, int TotalCount, bool Truncated);
public sealed record StatsResponse(object? Min, object? Max, int Count);

public static class ColumnEndpoints
{
    public const string BusyMessage = "Сервер занят: слишком много запросов списков значений, повторите позже";

    /// <summary>Столько значений показывает список фильтра клиента; больше сервер не отдаёт.</summary>
    private const int MaxTake = 5000;
    private const int DefaultTake = MaxTake;
    private const string LimiterPolicy = "columns";

    public static void MapColumns(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/distinct", Distinct).RequireRateLimiting(LimiterPolicy);
        app.MapPost("/api/stats", Stats).RequireRateLimiting(LimiterPolicy);
    }

    /// <summary>Политика поверх <see cref="ColumnRequestLimiter"/>; лишние запросы получают 429 с тем же JSON, что и прочие ошибки.</summary>
    public static void ConfigureLimiter(RateLimiterOptions options, ColumnRequestLimiter limiter)
    {
        options.AddPolicy(LimiterPolicy, _ => RateLimitPartition.Get(LimiterPolicy, _ => limiter.Limiter));
        options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        options.OnRejected = (context, cancellationToken) =>
            new ValueTask(context.HttpContext.Response.WriteAsJsonAsync(new { message = BusyMessage }, cancellationToken));
    }

    private static async Task<IResult> Distinct(HttpContext context, DatasetStore store)
    {
        var form = await LoadOptionsReader.ReadForm(context.Request);
        var (column, rows) = ReadColumn(form, store);
        return Results.Ok(column.Distinct(rows, form["search"], ReadTake(form["take"])));
    }

    private static async Task<IResult> Stats(HttpContext context, DatasetStore store)
    {
        var form = await LoadOptionsReader.ReadForm(context.Request);
        var (column, rows) = ReadColumn(form, store);
        return Results.Ok(column.Stats(rows));
    }

    internal static Column FindColumn(string? field, string parameter)
    {
        if (field is not null && Column.All.TryGetValue(field, out var column))
            return column;
        throw new BadHttpRequestException(
            $"Параметр {parameter} обязателен и принимает значения {string.Join(", ", Column.All.Keys)}");
    }

    private static (Column Column, IEnumerable<ProductionRecord> Rows) ReadColumn(IFormCollection form, DatasetStore store)
    {
        var column = FindColumn(form["field"], "field");
        var (dataset, options) = LoadOptionsReader.ReadFilterOnly(form);
        var source = ValueListFilter.Apply(store.Get(dataset).AsQueryable(), options);
        var filtered = DataSourceLoader.Load(source, options).data;
        return (column, filtered.Cast<ProductionRecord>());
    }

    private static int ReadTake(string? value)
    {
        if (string.IsNullOrEmpty(value)) return DefaultTake;
        if (int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var take) && take > 0 && take <= MaxTake)
            return take;
        throw new BadHttpRequestException($"Параметр take должен быть целым числом от 1 до {MaxTake}");
    }

    internal abstract class Column
    {
        public static readonly IReadOnlyDictionary<string, Column> All = new Column[]
        {
            new Column<int>("id", r => r.Id, Comparer<int>.Default, hasRange: true),
            new Column<DateTime>("date", r => r.Date, Comparer<DateTime>.Default, hasRange: true),
            new Column<string>("plant", r => r.Plant, StringComparer.Ordinal, hasRange: false),
            new Column<string>("line", r => r.Line, StringComparer.Ordinal, hasRange: false),
            new Column<string>("product", r => r.Product, StringComparer.Ordinal, hasRange: false),
            new Column<string>("batch", r => r.Batch, StringComparer.Ordinal, hasRange: false),
            new Column<double>("netWeight", r => r.NetWeight, Comparer<double>.Default, hasRange: true),
            new Column<double>("grossWeight", r => r.GrossWeight, Comparer<double>.Default, hasRange: true),
            new Column<int>("qty", r => r.Qty, Comparer<int>.Default, hasRange: true),
            new Column<string>("markingCode", r => r.MarkingCode, StringComparer.Ordinal, hasRange: false),
            new Column<string>("ean13", r => r.Ean13, StringComparer.Ordinal, hasRange: false),
            new Column<int>("status", r => r.Status, Comparer<int>.Default, hasRange: false),
            new Column<string>("operator", r => r.Operator, StringComparer.Ordinal, hasRange: false),
            Column<string>.List("labels", r => r.Labels, StringComparer.Ordinal),
        }.ToDictionary(c => c.Field, StringComparer.Ordinal);

        protected Column(string field) => Field = field;

        public string Field { get; }

        public abstract string Text(ProductionRecord row);

        public abstract DistinctResponse Distinct(IEnumerable<ProductionRecord> rows, string? search, int take);

        public abstract StatsResponse Stats(IEnumerable<ProductionRecord> rows);
    }

    private sealed class Column<T> : Column where T : notnull
    {
        private readonly Func<IEnumerable<ProductionRecord>, IEnumerable<T>> _values;
        private readonly Func<ProductionRecord, object> _cell;
        private readonly IComparer<T> _order;
        private readonly bool _hasRange;

        public Column(string field, Func<ProductionRecord, T> value, IComparer<T> order, bool hasRange)
            : this(field, rows => rows.Select(value), row => value(row), order, hasRange) { }

        private Column(
            string field,
            Func<IEnumerable<ProductionRecord>, IEnumerable<T>> values,
            Func<ProductionRecord, object> cell,
            IComparer<T> order,
            bool hasRange)
            : base(field)
        {
            _values = values;
            _cell = cell;
            _order = order;
            _hasRange = hasRange;
        }

        public static Column<T> List(string field, Func<ProductionRecord, IEnumerable<T>> values, IComparer<T> order) =>
            new(field, rows => rows.SelectMany(values), row => string.Join(", ", values(row)), order, hasRange: false);

        public override string Text(ProductionRecord row) => ValueFormatter.Text(Field, _cell(row));

        public override DistinctResponse Distinct(IEnumerable<ProductionRecord> rows, string? search, int take)
        {
            var groups = _values(rows)
                .GroupBy(v => v)
                .Select(g => (Value: g.Key, Text: ValueFormatter.Text(Field, g.Key), Count: g.Count()));
            if (!string.IsNullOrEmpty(search))
                groups = groups.Where(g => g.Text.Contains(search, StringComparison.OrdinalIgnoreCase));

            var found = groups.ToList();
            var items = found
                .OrderBy(g => g.Value, _order)
                .Take(take)
                .Select(g => new DistinctItem(g.Value, g.Text, g.Count))
                .ToArray();
            return new DistinctResponse(items, found.Count, found.Count > items.Length);
        }

        public override StatsResponse Stats(IEnumerable<ProductionRecord> rows)
        {
            if (!_hasRange)
                throw new BadHttpRequestException($"Границы есть только у числовых колонок и даты, колонка {Field} их не имеет");

            var count = 0;
            T min = default!, max = default!;
            foreach (var value in _values(rows))
            {
                if (count == 0 || _order.Compare(value, min) < 0) min = value;
                if (count == 0 || _order.Compare(value, max) > 0) max = value;
                count++;
            }

            return count == 0 ? new StatsResponse(null, null, 0) : new StatsResponse(min, max, count);
        }
    }
}

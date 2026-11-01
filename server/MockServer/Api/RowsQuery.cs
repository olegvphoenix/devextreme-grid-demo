using DevExtreme.AspNet.Data;
using DevExtreme.AspNet.Data.ResponseModel;
using MockServer.Data;

namespace MockServer.Api;

/// <summary>
/// DataSourceLoader считает totalSummary по отсортированному (или сгруппированному)
/// запросу: на 1 000 000 строк это полная сортировка на каждый запрос, тогда как
/// странице хватает частичной. Итоги считаются вторым проходом по отфильтрованному
/// набору без сортировки и подставляются в результат страницы.
/// </summary>
public static class RowsQuery
{
    public static LoadResult Load(IQueryable<ProductionRecord> source, DataSourceLoadOptionsBase options)
    {
        source = ValueListFilter.Apply(source, options);
        if (!NeedsSeparateSummary(options))
            return DataSourceLoader.Load(source, options);

        var summaryOptions = SummaryOptions(options);
        LoadResult result;
        options.TotalSummary = null;
        try
        {
            result = DataSourceLoader.Load(source, options);
        }
        finally
        {
            options.TotalSummary = summaryOptions.TotalSummary;
        }
        result.summary = DataSourceLoader.Load(source, summaryOptions).summary;
        return result;
    }

    public static DataSourceLoadOptionsBase SummaryOptions(DataSourceLoadOptionsBase options) => new()
    {
        StringToLower = options.StringToLower,
        Filter = options.Filter,
        TotalSummary = options.TotalSummary,
        Take = 1,
    };

    private static bool NeedsSeparateSummary(DataSourceLoadOptionsBase options) =>
        options.TotalSummary is { Length: > 0 } && (options.Sort is { Length: > 0 } || options.Group is { Length: > 0 });
}

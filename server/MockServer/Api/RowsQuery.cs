using DevExtreme.AspNet.Data;
using DevExtreme.AspNet.Data.ResponseModel;
using MockServer.Data;

namespace MockServer.Api;

/// <summary>
/// DataSourceLoader считает totalSummary по отсортированному (или сгруппированному)
/// запросу: на 1 000 000 строк это полная сортировка на каждый запрос, тогда как
/// странице хватает частичной. Итоги считаются вторым проходом по отфильтрованному
/// набору без сортировки и подставляются в результат страницы. Списки значений
/// снимаются с фильтра на время загрузки (<see cref="ValueListFilter"/>); параметры
/// вызывающего возвращаются как были.
/// </summary>
public static class RowsQuery
{
    public static LoadResult Load(IQueryable<ProductionRecord> source, DataSourceLoadOptionsBase options)
    {
        var filter = options.Filter;
        var totalSummary = options.TotalSummary;
        try
        {
            source = ValueListFilter.Apply(source, options);
            if (!NeedsSeparateSummary(options))
                return DataSourceLoader.Load(source, options);

            var summaryOptions = SummaryOptions(options);
            options.TotalSummary = null;
            var result = DataSourceLoader.Load(source, options);
            result.summary = DataSourceLoader.Load(source, summaryOptions).summary;
            return result;
        }
        finally
        {
            options.Filter = filter;
            options.TotalSummary = totalSummary;
        }
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

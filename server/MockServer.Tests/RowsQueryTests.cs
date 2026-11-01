using DevExtreme.AspNet.Data;
using MockServer.Api;
using MockServer.Data;

namespace MockServer.Tests;

public class RowsQueryTests
{
    private static DataSourceLoadOptionsBase SortedPageWithSummary() => new()
    {
        StringToLower = true,
        Skip = 100,
        Take = 50,
        RequireTotalCount = true,
        Sort = new[] { new SortingInfo { Selector = "date", Desc = true } },
        Filter = new List<object> { "status", "=", 1 },
        TotalSummary = new[]
        {
            new SummaryInfo { Selector = "id", SummaryType = "count" },
            new SummaryInfo { Selector = "qty", SummaryType = "sum" },
        },
    };

    [Fact]
    public void SummaryPassKeepsTheFilterAndDropsSortingPagingAndCounts()
    {
        var options = SortedPageWithSummary();

        var summary = RowsQuery.SummaryOptions(options);

        Assert.Null(summary.Sort);
        Assert.Null(summary.Group);
        Assert.Equal(0, summary.Skip);
        Assert.Equal(1, summary.Take);
        Assert.False(summary.RequireTotalCount);
        Assert.False(summary.RequireGroupCount);
        Assert.True(summary.StringToLower);
        Assert.Same(options.Filter, summary.Filter);
        Assert.Same(options.TotalSummary, summary.TotalSummary);
    }

    [Fact]
    public void SortedPageGetsTheSameSummaryAsTheUnsortedQuery()
    {
        var rows = DataGenerator.Generate(1000, new DateOnly(2026, 10, 31)).AsQueryable();
        var plain = DataSourceLoader.Load(rows, new DataSourceLoadOptionsBase
        {
            Filter = new List<object> { "status", "=", 1 },
            TotalSummary = SortedPageWithSummary().TotalSummary,
        });

        var sorted = RowsQuery.Load(rows, SortedPageWithSummary());

        Assert.Equal(plain.summary, sorted.summary);
        Assert.Equal(50, sorted.data.Cast<ProductionRecord>().Count());
        Assert.Equal(Convert.ToInt32(plain.summary![0]), sorted.totalCount);
        var dates = sorted.data.Cast<ProductionRecord>().Select(r => r.Date).ToList();
        Assert.Equal(dates.OrderByDescending(d => d), dates);
    }

    [Fact]
    public void LoadLeavesTheCallersOptionsUntouched()
    {
        var rows = DataGenerator.Generate(1000, new DateOnly(2026, 10, 31)).AsQueryable();
        var options = SortedPageWithSummary();
        var summary = options.TotalSummary;

        RowsQuery.Load(rows, options);

        Assert.Same(summary, options.TotalSummary);
        Assert.NotNull(options.Sort);
    }

    [Fact]
    public void GroupedQueryKeepsGroupsAndGroupCountAndGetsTheUnsortedTotal()
    {
        var rows = DataGenerator.Generate(1000, new DateOnly(2026, 10, 31)).AsQueryable();
        var totalSummary = SortedPageWithSummary().TotalSummary;
        var plain = DataSourceLoader.Load(rows, new DataSourceLoadOptionsBase { TotalSummary = totalSummary });

        var grouped = RowsQuery.Load(rows, new DataSourceLoadOptionsBase
        {
            Skip = 0,
            Take = 2,
            RequireTotalCount = true,
            RequireGroupCount = true,
            Group = new[] { new GroupingInfo { Selector = "plant", IsExpanded = false } },
            GroupSummary = new[] { new SummaryInfo { Selector = "qty", SummaryType = "sum" } },
            TotalSummary = totalSummary,
        });

        Assert.Equal(plain.summary, grouped.summary);
        Assert.Equal(4, grouped.groupCount);
        Assert.Equal(1000, grouped.totalCount);
        var groups = grouped.data.Cast<DevExtreme.AspNet.Data.ResponseModel.Group>().ToList();
        Assert.Equal(2, groups.Count);
        Assert.All(groups, g => Assert.Single(g.summary!));
    }

    [Fact]
    public void SummaryWithoutSortOrGroupIsLoadedInOnePass()
    {
        var rows = DataGenerator.Generate(1000, new DateOnly(2026, 10, 31)).AsQueryable();
        var options = new DataSourceLoadOptionsBase
        {
            Take = 5,
            RequireTotalCount = true,
            TotalSummary = SortedPageWithSummary().TotalSummary,
        };
        var expected = DataSourceLoader.Load(rows, new DataSourceLoadOptionsBase
        {
            Take = 5,
            RequireTotalCount = true,
            TotalSummary = options.TotalSummary,
        });

        var result = RowsQuery.Load(rows, options);

        Assert.Equal(expected.summary, result.summary);
        Assert.Equal(expected.totalCount, result.totalCount);
        Assert.Equal(5, result.data.Cast<ProductionRecord>().Count());
    }
}

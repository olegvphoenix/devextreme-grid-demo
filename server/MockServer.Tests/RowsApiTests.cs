using System.Net;
using System.Text.Json;
using DevExtreme.AspNet.Data;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using MockServer.Api;

namespace MockServer.Tests;

public class RowsApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public RowsApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    private Task<JsonElement> Query(params (string, string)[] fields) => ApiClient.Query(_client, fields);

    [Fact] public async Task PagingReturnsOnlyRequestedPage()
    {
        var json = await Query(("dataset","1000"),("skip","20"),("take","10"),("requireTotalCount","true"));
        Assert.Equal(10, json.GetProperty("data").GetArrayLength());
        Assert.Equal(1000, json.GetProperty("totalCount").GetInt32());
    }

    [Fact] public async Task SortingByDateDescending()
    {
        var json = await Query(("dataset","1000"),("take","5"),("sort","[{\"selector\":\"date\",\"desc\":true}]"));
        var dates = json.GetProperty("data").EnumerateArray().Select(r => r.GetProperty("date").GetString()).ToList();
        Assert.Equal(dates.OrderByDescending(d => d, StringComparer.Ordinal), dates);
    }

    [Fact] public async Task FilterOrChainAndDateRange()
    {
        var filter = "[[[\"status\",\"=\",1],\"or\",[\"status\",\"=\",2]],\"and\",[[\"date\",\">=\",\"2021-01-01\"],\"and\",[\"date\",\"<=\",\"2021-12-31\"]]]";
        var json = await Query(("dataset","1000"),("take","1000"),("filter",filter),("requireTotalCount","true"));
        Assert.All(json.GetProperty("data").EnumerateArray(), r =>
        {
            Assert.Contains(r.GetProperty("status").GetInt32(), new[] { 1, 2 });
            Assert.StartsWith("2021-", r.GetProperty("date").GetString());
        });
    }

    [Fact] public async Task GroupingReturnsGroupsWithServerSummaries()
    {
        var json = await Query(("dataset","1000"),("skip","0"),("take","2"),
            ("group","[{\"selector\":\"plant\",\"isExpanded\":false}]"),
            ("groupSummary","[{\"selector\":\"qty\",\"summaryType\":\"sum\"},{\"selector\":\"netWeight\",\"summaryType\":\"avg\"}]"),
            ("totalSummary","[{\"selector\":\"qty\",\"summaryType\":\"sum\"}]"),
            ("requireGroupCount","true"),("requireTotalCount","true"));
        Assert.Equal(4, json.GetProperty("groupCount").GetInt32());
        Assert.Equal(2, json.GetProperty("data").GetArrayLength());
        Assert.Equal(2, json.GetProperty("data")[0].GetProperty("summary").GetArrayLength());
        Assert.Equal(1000, json.GetProperty("totalCount").GetInt32());
    }

    [Fact] public async Task WithoutTakeAllRowsAreReturned()
    {
        var json = await Query(("dataset","1000"));
        Assert.Equal(1000, json.GetProperty("data").GetArrayLength());
    }

    [Fact]
    public async Task FilterIsCaseInsensitive()
    {
        var json = await Query(("dataset","1000"),("take","5"),("filter","[\"plant\",\"contains\",\"север\"]"));
        Assert.NotEqual(0, json.GetProperty("data").GetArrayLength());
        Assert.All(json.GetProperty("data").EnumerateArray(), r => Assert.Equal("Завод Север", r.GetProperty("plant").GetString()));
    }

    [Fact]
    public async Task DatesAreSerializedAsIsoDay()
    {
        var json = await Query(("dataset","1000"),("take","1"),("sort","[{\"selector\":\"id\",\"desc\":false}]"));
        Assert.Equal("2020-02-01", json.GetProperty("data")[0].GetProperty("date").GetString());
    }

    [Theory]
    [InlineData("5")]
    [InlineData("abc")]
    [InlineData(null)]
    public async Task UnknownOrMissingDatasetIs400WithMessage(string? dataset)
    {
        var fields = dataset is null ? new[] { ("take", "1") } : new[] { ("dataset", dataset), ("take", "1") };
        var response = await ApiClient.PostForm(_client, "/api/rows/query", fields);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));
    }

    [Fact]
    public async Task MalformedSortJsonIs400WithMessage()
    {
        var response = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "1000"), ("take", "1"), ("sort", "[{selector:date}]"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));
    }

    [Fact]
    public async Task NonFormBodyIs400()
    {
        var response = await _client.PostAsync("/api/rows/query", new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public void LimiterRefusesTheThirdConcurrentEntry()
    {
        var limiter = new HeavyRequestLimiter(2);

        Assert.True(limiter.TryEnter(out var first));
        Assert.True(limiter.TryEnter(out var second));
        Assert.False(limiter.TryEnter(out _));

        first.Dispose();
        first.Dispose();
        Assert.True(limiter.TryEnter(out var third));
        Assert.False(limiter.TryEnter(out _));
        second.Dispose();
        third.Dispose();
    }

    [Theory]
    [InlineData(0, null, true)]
    [InlineData(-1, null, true)]
    [InlineData(501, null, true)]
    [InlineData(1000000, null, true)]
    [InlineData(20, true, true)]
    [InlineData(500, null, false)]
    [InlineData(20, false, false)]
    [InlineData(1, null, false)]
    public void HeavyMeansNoPageALargePageOrAnExpandedGroup(int take, bool? isExpanded, bool heavy)
    {
        var options = new DataSourceLoadOptionsBase { Take = take };
        if (isExpanded is not null)
            options.Group = new[] { new GroupingInfo { Selector = "plant", IsExpanded = isExpanded.Value } };

        Assert.Equal(heavy, HeavyRequestLimiter.IsHeavy(options));
    }

    [Theory]
    [InlineData("take", "1000000", null, null)]
    [InlineData("take", "20", "group", "[{\"selector\":\"status\",\"isExpanded\":true}]")]
    public async Task LargePageOrExpandedGroupIs429WhenTheLimiterIsFull(string key, string value, string? key2, string? value2)
    {
        var fields = key2 is null
            ? new[] { ("dataset", "1000"), (key, value) }
            : new[] { ("dataset", "1000"), (key, value), (key2, value2!) };
        var limiter = _factory.Services.GetRequiredService<HeavyRequestLimiter>();
        Assert.True(limiter.TryEnter(out var first));
        Assert.True(limiter.TryEnter(out var second));
        try
        {
            var heavy = await ApiClient.PostForm(_client, "/api/rows/query", fields);
            Assert.Equal((HttpStatusCode)429, heavy.StatusCode);
            var json = JsonDocument.Parse(await heavy.Content.ReadAsStringAsync()).RootElement;
            Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));

            var largestPage = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "1000"), ("take", "500"));
            Assert.Equal(HttpStatusCode.OK, largestPage.StatusCode);
            var collapsedGroups = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "1000"), ("take", "20"),
                ("group", "[{\"selector\":\"plant\",\"isExpanded\":false}]"), ("requireGroupCount", "true"));
            Assert.Equal(HttpStatusCode.OK, collapsedGroups.StatusCode);
        }
        finally
        {
            first.Dispose();
            second.Dispose();
        }
    }

    [Fact]
    public async Task QueryWithoutTakeIs429WhenTheLimiterIsFull()
    {
        var limiter = _factory.Services.GetRequiredService<HeavyRequestLimiter>();
        Assert.True(limiter.TryEnter(out var first));
        Assert.True(limiter.TryEnter(out var second));
        try
        {
            var heavy = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "1000"));
            Assert.Equal((HttpStatusCode)429, heavy.StatusCode);
            var json = JsonDocument.Parse(await heavy.Content.ReadAsStringAsync()).RootElement;
            Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));

            var paged = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "1000"), ("take", "1"));
            Assert.Equal(HttpStatusCode.OK, paged.StatusCode);
        }
        finally
        {
            first.Dispose();
            second.Dispose();
        }

        var afterRelease = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "1000"));
        Assert.Equal(HttpStatusCode.OK, afterRelease.StatusCode);
    }
}

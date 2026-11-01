using System.Diagnostics;
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

    private static string OrChain(string field, IEnumerable<string> values) =>
        "[" + string.Join(",\"or\",", values.Select(v => $"[\"{field}\",\"=\",{v}]")) + "]";

    [Fact]
    public async Task FiveThousandEqualsOperandsOnMarkingCodeReturnTheMatchingRowsOfTheMillionSet()
    {
        var rows = _factory.Services.GetRequiredService<MockServer.Data.DatasetStore>().Get(1000000);
        var codes = rows.Where((_, i) => i % 200 == 0).Take(5000).Select(r => r.MarkingCode).ToArray();
        var expected = codes.ToHashSet(StringComparer.Ordinal);

        var sw = Stopwatch.StartNew();
        var json = await Query(("dataset", "1000000"), ("skip", "0"), ("take", "500"), ("requireTotalCount", "true"),
            ("sort", "[{\"selector\":\"id\",\"desc\":false}]"),
            ("totalSummary", "[{\"summaryType\":\"count\"},{\"selector\":\"qty\",\"summaryType\":\"sum\"}]"),
            ("filter", OrChain("markingCode", codes.Select(c => $"\"{c}\""))));
        sw.Stop();

        Assert.Equal(5000, json.GetProperty("totalCount").GetInt32());
        Assert.Equal(5000, json.GetProperty("summary")[0].GetInt32());
        var page = json.GetProperty("data").EnumerateArray().Select(r => r.GetProperty("markingCode").GetString()!).ToList();
        Assert.Equal(500, page.Count);
        Assert.All(page, code => Assert.Contains(code, expected));
        Assert.True(sw.ElapsedMilliseconds < 15000, $"the filter took {sw.ElapsedMilliseconds} ms");
    }

    [Fact]
    public async Task TwentyThousandOperandsAreTheLimit()
    {
        var atLimit = await Query(("dataset", "1000"), ("take", "1"), ("requireTotalCount", "true"),
            ("filter", OrChain("id", Enumerable.Range(1, 20000).Select(i => i.ToString()))));
        Assert.Equal(1000, atLimit.GetProperty("totalCount").GetInt32());

        var overLimit = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "1000"), ("take", "1"),
            ("filter", OrChain("id", Enumerable.Range(1, 20001).Select(i => i.ToString()))));
        Assert.Equal(HttpStatusCode.BadRequest, overLimit.StatusCode);
        var json = JsonDocument.Parse(await overLimit.Content.ReadAsStringAsync()).RootElement;
        Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));
    }

    /// <summary>Как шлёт клиент: колонка со списком и границей — свой «and», другая колонка — внешний «and».</summary>
    [Fact]
    public async Task TheClientsListPlusRangeUnderAnotherColumnIsFastOnTheMillionSet()
    {
        var rows = _factory.Services.GetRequiredService<MockServer.Data.DatasetStore>().Get(1000000);
        var plant = rows[0].Plant;
        var codes = rows.Where((_, i) => i % 200 == 0).Take(5000).Select(r => r.MarkingCode).ToArray();
        var expected = codes.ToHashSet(StringComparer.Ordinal);
        var expectedCount = rows.Where(r => r.Plant == plant && expected.Contains(r.MarkingCode) && r.Id >= 1000).Count();
        var filter = $"[[\"plant\",\"=\",\"{plant}\"],\"and\",[{OrChain("markingCode", codes.Select(c => $"\"{c}\""))},\"and\",[\"id\",\">=\",1000]]]";

        var sw = Stopwatch.StartNew();
        var json = await Query(("dataset", "1000000"), ("skip", "0"), ("take", "500"), ("requireTotalCount", "true"),
            ("totalSummary", "[{\"summaryType\":\"count\"},{\"selector\":\"qty\",\"summaryType\":\"sum\"}]"),
            ("filter", filter));
        sw.Stop();

        Assert.Equal(expectedCount, json.GetProperty("totalCount").GetInt32());
        Assert.All(json.GetProperty("data").EnumerateArray(), r =>
        {
            Assert.Equal(plant, r.GetProperty("plant").GetString());
            Assert.Contains(r.GetProperty("markingCode").GetString()!, expected);
            Assert.True(r.GetProperty("id").GetInt32() >= 1000);
        });
        Assert.True(sw.ElapsedMilliseconds < 15000, $"the filter took {sw.ElapsedMilliseconds} ms");
    }

    [Fact]
    public async Task ResidualConditionsAboveTheCapAre400WithMessageBeforeAnyRowIsRead()
    {
        var chain = "[" + string.Join(",\"and\",", Enumerable.Range(1, 6000).Select(i => $"[\"markingCode\",\"<>\",\"{i}\"]")) + "]";

        var sw = Stopwatch.StartNew();
        var response = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "1000000"), ("take", "50"), ("filter", chain));
        sw.Stop();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Matches("[а-яА-Я]", json.GetProperty("message").GetString());
        Assert.True(sw.ElapsedMilliseconds < 5000, $"the rejection took {sw.ElapsedMilliseconds} ms");
    }

    [Fact]
    public async Task AFormValueAboveTwoMegabytesIs400WithMessage()
    {
        var filter = $"[\"plant\",\"=\",\"{new string('x', 2 * 1024 * 1024)}\"]";

        var response = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "1000"), ("take", "1"), ("filter", filter));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal("Некорректный запрос: форма повреждена или значение длиннее 2 МБ", json.GetProperty("message").GetString());
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

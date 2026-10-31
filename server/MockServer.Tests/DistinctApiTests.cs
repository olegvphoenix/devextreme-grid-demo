using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using MockServer.Data;

namespace MockServer.Tests;

public class DistinctApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public DistinctApiTests(WebApplicationFactory<Program> factory) => _client = factory.CreateClient();

    private Task<JsonElement> Distinct(params (string, string)[] fields) => ApiClient.Post(_client, "/api/distinct", fields);

    private Task<JsonElement> Query(params (string, string)[] fields) => ApiClient.Query(_client, fields);

    [Fact] public async Task StatusListShowsRussianNames()
    {
        var r = await Distinct(("dataset","1000"),("field","status"));
        Assert.Equal(new[] { "Новый", "В работе", "Агрегирован", "Закрыт" },
            r.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("text").GetString()));
    }

    [Fact] public async Task ListDependsOnFiltersOfOtherColumns()
    {
        var all = await Distinct(("dataset","1000"),("field","line"));
        var plantName = Catalog.PlantLines.Keys.First();
        var narrowed = await Distinct(("dataset","1000"),("field","line"),("filter",$"[\"plant\",\"=\",\"{plantName}\"]"));
        Assert.Equal(
            Catalog.PlantLines[plantName].Keys.OrderBy(k => k, StringComparer.Ordinal),
            narrowed.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("value").GetString()).OrderBy(k => k, StringComparer.Ordinal));
        Assert.True(narrowed.GetProperty("totalCount").GetInt32() < all.GetProperty("totalCount").GetInt32());
    }

    [Fact] public async Task DatesAreFormattedForDisplay()
    {
        var r = await Distinct(("dataset","1000"),("field","date"));
        Assert.Matches("^\\d{2}\\.\\d{2}\\.\\d{4}$", r.GetProperty("items")[0].GetProperty("text").GetString());
        Assert.Matches("^\\d{4}-\\d{2}-\\d{2}$", r.GetProperty("items")[0].GetProperty("value").GetString());
    }

    [Fact] public async Task TruncationIsReported()
    {
        var r = await Distinct(("dataset","1000"),("field","id"),("take","10"));
        Assert.Equal(10, r.GetProperty("items").GetArrayLength());
        Assert.True(r.GetProperty("truncated").GetBoolean());
        Assert.Equal(1000, r.GetProperty("totalCount").GetInt32());
    }

    [Fact] public async Task SearchWorksOnDisplayText()
    {
        var r = await Distinct(("dataset","1000"),("field","status"),("search","рабо"));
        Assert.Equal("В работе", r.GetProperty("items")[0].GetProperty("text").GetString());
        Assert.Equal(1, r.GetProperty("items").GetArrayLength());
    }

    [Fact] public async Task CountsSumToFilteredTotal()
    {
        var r = await Distinct(("dataset","1000"),("field","status"));
        Assert.Equal(1000, r.GetProperty("items").EnumerateArray().Sum(i => i.GetProperty("count").GetInt32()));
    }

    [Fact]
    public async Task FullListIsNotTruncatedAndIsSortedByValue()
    {
        var r = await Distinct(("dataset","1000"),("field","status"));

        Assert.False(r.GetProperty("truncated").GetBoolean());
        Assert.Equal(4, r.GetProperty("totalCount").GetInt32());
        Assert.Equal(new[] { 0, 1, 2, 3 }, r.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("value").GetInt32()));
    }

    [Fact]
    public async Task DefaultTakeIsFiveThousand()
    {
        var r = await Distinct(("dataset","100000"),("field","id"));

        Assert.Equal(5000, r.GetProperty("items").GetArrayLength());
        Assert.Equal(100000, r.GetProperty("totalCount").GetInt32());
        Assert.True(r.GetProperty("truncated").GetBoolean());
    }

    [Fact]
    public async Task SearchIgnoresCaseAndRunsBeforeTake()
    {
        var r = await Distinct(("dataset","1000"),("field","status"),("search","РАБО"),("take","1"));

        var item = Assert.Single(r.GetProperty("items").EnumerateArray());
        Assert.Equal("В работе", item.GetProperty("text").GetString());
        Assert.Equal(1, r.GetProperty("totalCount").GetInt32());
        Assert.False(r.GetProperty("truncated").GetBoolean());
    }

    [Fact]
    public async Task SearchOnDatesMatchesTheDisplayedFormat()
    {
        var r = await Distinct(("dataset","1000"),("field","date"),("search",".02.2020"));

        Assert.NotEqual(0, r.GetProperty("items").GetArrayLength());
        Assert.All(r.GetProperty("items").EnumerateArray(), i =>
        {
            Assert.EndsWith(".02.2020", i.GetProperty("text").GetString());
            Assert.StartsWith("2020-02-", i.GetProperty("value").GetString());
        });
    }

    [Fact]
    public async Task DateValueMatchesRowsOnEqualsFilter()
    {
        var r = await Distinct(("dataset","1000"),("field","date"));
        var first = r.GetProperty("items")[0];
        Assert.Equal("2020-02-01", first.GetProperty("value").GetString());

        var rows = await Query(("dataset","1000"),("take","1"),("requireTotalCount","true"),("filter","[\"date\",\"=\",\"2020-02-01\"]"));

        Assert.Equal(first.GetProperty("count").GetInt32(), rows.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task WeightValueIsARawNumberThatMatchesRowsOnEqualsFilter()
    {
        var r = await Distinct(("dataset","1000"),("field","netWeight"),("take","1"));
        var first = r.GetProperty("items")[0];
        Assert.Equal(JsonValueKind.Number, first.GetProperty("value").ValueKind);
        Assert.Contains(",", first.GetProperty("text").GetString());

        var rows = await Query(("dataset","1000"),("take","1"),("requireTotalCount","true"),
            ("filter",$"[\"netWeight\",\"=\",{first.GetProperty("value").GetRawText()}]"));

        Assert.Equal(first.GetProperty("count").GetInt32(), rows.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task LabelsAreExpandedOneItemPerLabel()
    {
        await _client.PutAsJsonAsync("/api/rows/1/labels?dataset=1000", new { labels = new[] { "а", "б" } });

        var r = await Distinct(("dataset","1000"),("field","labels"));
        var items = r.GetProperty("items").EnumerateArray().ToDictionary(i => i.GetProperty("value").GetString()!, i => i.GetProperty("count").GetInt32());

        Assert.Equal(1, items["а"]);
        Assert.Equal(1, items["б"]);
        var preset = Catalog.LabelPresets[0];
        var rows = await Query(("dataset","1000"),("take","1"),("requireTotalCount","true"),("filter",$"[\"labelsKey\",\"contains\",\"|{preset}|\"]"));
        Assert.Equal(rows.GetProperty("totalCount").GetInt32(), items[preset]);
    }

    [Theory]
    [InlineData("/api/distinct", "labelsKey")]
    [InlineData("/api/distinct", "")]
    [InlineData("/api/distinct", null)]
    [InlineData("/api/stats", "nope")]
    [InlineData("/api/stats", null)]
    public async Task UnknownOrMissingFieldIs400WithMessage(string url, string? field)
    {
        var fields = field is null ? new[] { ("dataset", "1000") } : new[] { ("dataset", "1000"), ("field", field) };
        var response = await ApiClient.PostForm(_client, url, fields);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-5")]
    [InlineData("many")]
    public async Task InvalidTakeIs400WithMessage(string take)
    {
        var response = await ApiClient.PostForm(_client, "/api/distinct", ("dataset", "1000"), ("field", "id"), ("take", take));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));
    }

    [Fact]
    public async Task NonFormBodyIs400()
    {
        var response = await _client.PostAsync("/api/distinct", new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}

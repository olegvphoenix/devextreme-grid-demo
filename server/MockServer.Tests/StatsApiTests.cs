using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace MockServer.Tests;

public class StatsApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public StatsApiTests(WebApplicationFactory<Program> factory) => _client = factory.CreateClient();

    private Task<JsonElement> Stats(params (string, string)[] fields) => ApiClient.Post(_client, "/api/stats", fields);

    [Fact]
    public async Task QtyBoundsAreOrderedAndCountTheWholeDataset()
    {
        var r = await Stats(("dataset","1000"),("field","qty"));

        Assert.True(r.GetProperty("min").GetInt32() <= r.GetProperty("max").GetInt32());
        Assert.True(r.GetProperty("min").GetInt32() > 0);
        Assert.Equal(1000, r.GetProperty("count").GetInt32());
    }

    [Fact]
    public async Task WeightBoundsAreRawNumbers()
    {
        var r = await Stats(("dataset","1000"),("field","netWeight"));

        Assert.Equal(JsonValueKind.Number, r.GetProperty("min").ValueKind);
        Assert.True(r.GetProperty("min").GetDouble() <= r.GetProperty("max").GetDouble());
    }

    [Fact]
    public async Task DateBoundsAreIsoDays()
    {
        var r = await Stats(("dataset","1000"),("field","date"));

        var min = r.GetProperty("min").GetString();
        var max = r.GetProperty("max").GetString();
        Assert.Equal("2020-02-01", min);
        Assert.Matches("^\\d{4}-\\d{2}-\\d{2}$", max);
        Assert.True(string.CompareOrdinal(min, max) <= 0);
    }

    [Fact]
    public async Task CountRespectsTheFilter()
    {
        var filter = "[\"status\",\"=\",1]";
        var r = await Stats(("dataset","1000"),("field","qty"),("filter",filter));
        var rows = await ApiClient.Query(_client, ("dataset","1000"),("take","1"),("requireTotalCount","true"),("filter",filter));

        Assert.Equal(rows.GetProperty("totalCount").GetInt32(), r.GetProperty("count").GetInt32());
        Assert.True(r.GetProperty("count").GetInt32() < 1000);
    }

    [Fact]
    public async Task EmptySelectionHasNullBoundsAndZeroCount()
    {
        var r = await Stats(("dataset","1000"),("field","qty"),("filter","[\"id\",\"=\",0]"));

        Assert.Equal(JsonValueKind.Null, r.GetProperty("min").ValueKind);
        Assert.Equal(JsonValueKind.Null, r.GetProperty("max").ValueKind);
        Assert.Equal(0, r.GetProperty("count").GetInt32());
    }

    [Theory]
    [InlineData("plant")]
    [InlineData("status")]
    [InlineData("labels")]
    public async Task ColumnsWithoutARangeAre400WithMessage(string field)
    {
        var response = await ApiClient.PostForm(_client, "/api/stats", ("dataset", "1000"), ("field", field));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));
    }
}

using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using MockServer.Data;

namespace MockServer.Tests;

public class DatasetsApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public DatasetsApiTests(WebApplicationFactory<Program> factory) => _factory = factory;

    [Fact]
    public async Task HealthReturns200()
    {
        var response = await _factory.CreateClient().GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task DatasetsReturnsThreeSizes()
    {
        var infos = await _factory.CreateClient().GetFromJsonAsync<DatasetInfo[]>("/api/datasets");
        Assert.NotNull(infos);
        Assert.Equal(new[] { 1000, 100000, 1000000 }, infos.Select(i => i.Size));
    }

    [Fact]
    public async Task DatasetsReportsGenerationAfterFirstGet()
    {
        var client = _factory.CreateClient();
        var store = _factory.Services.GetRequiredService<DatasetStore>();
        store.Get(1000);

        var json = await client.GetStringAsync("/api/datasets");
        using var doc = JsonDocument.Parse(json);
        var thousand = doc.RootElement.EnumerateArray().Single(e => e.GetProperty("size").GetInt32() == 1000);
        Assert.True(thousand.GetProperty("generated").GetBoolean());
        Assert.Equal(JsonValueKind.Number, thousand.GetProperty("generationMs").ValueKind);
    }

    [Fact]
    public void StoreReturnsTheSameArrayTwice()
    {
        var store = _factory.Services.GetRequiredService<DatasetStore>();
        Assert.Same(store.Get(1000), store.Get(1000));
        Assert.Equal(1000, store.Get(1000).Length);
    }

    [Fact]
    public void StoreRejectsUnknownSize()
    {
        var store = _factory.Services.GetRequiredService<DatasetStore>();
        Assert.Throws<ArgumentOutOfRangeException>(() => store.Get(5));
    }

    [Fact]
    public void StoreUpdatesLabelsInPlace()
    {
        var store = new DatasetStore(new DateOnly(2026, 10, 31));
        var updated = store.UpdateLabels(1000, 7, new[] { "срочно", "брак" });

        Assert.Equal(7, updated.Id);
        Assert.Equal(new[] { "срочно", "брак" }, updated.Labels);
        Assert.Equal("|срочно|брак|", updated.LabelsKey);
        Assert.Same(updated, store.Get(1000)[6]);
        Assert.Throws<KeyNotFoundException>(() => store.UpdateLabels(1000, 1001, Array.Empty<string>()));
    }

    [Fact]
    public void JsonWritesDatesAsIsoDayAndCamelCase()
    {
        var options = _factory.Services.GetRequiredService<IOptions<JsonOptions>>().Value.SerializerOptions;
        var record = DataGenerator.Generate(1, new DateOnly(2026, 10, 31))[0];

        var json = JsonSerializer.Serialize(record, options);

        Assert.Contains("\"date\":\"2020-02-01\"", json);
        Assert.Contains("\"netWeight\":", json);
        Assert.DoesNotContain("NetWeight", json);
        var back = JsonSerializer.Deserialize<ProductionRecord>(json, options);
        Assert.NotNull(back);
        Assert.Equal(new DateTime(2020, 2, 1), back.Date);
        Assert.Equal(DateTimeKind.Unspecified, back.Date.Kind);
    }

    [Theory]
    [InlineData("{\"date\":5}")]
    [InlineData("{\"date\":\"2020-13-45\"}")]
    [InlineData("{\"date\":\"01.02.2020\"}")]
    public void JsonRejectsBadDatesWithJsonException(string json)
    {
        var options = _factory.Services.GetRequiredService<IOptions<JsonOptions>>().Value.SerializerOptions;
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<ProductionRecord>(json, options));
    }
}

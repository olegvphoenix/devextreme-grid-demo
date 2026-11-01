using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using MockServer.Data;

namespace MockServer.Tests;

public class LabelsApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public LabelsApiTests(WebApplicationFactory<Program> factory) => _client = factory.CreateClient();

    private Task<JsonElement> Query(params (string, string)[] fields) => ApiClient.Query(_client, fields);

    [Fact]
    public async Task PutLabelsReturnsTheRecordAndTheNextQueryReflectsIt()
    {
        var response = await _client.PutAsJsonAsync("/api/rows/42/labels?dataset=1000", new { labels = new[] { "а", "б" } });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var record = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(42, record.GetProperty("id").GetInt32());
        Assert.Equal(new[] { "а", "б" }, record.GetProperty("labels").EnumerateArray().Select(l => l.GetString()));
        Assert.Equal("|а|б|", record.GetProperty("labelsKey").GetString());

        var json = await Query(("dataset","1000"),("filter","[\"id\",\"=\",42]"));
        var row = Assert.Single(json.GetProperty("data").EnumerateArray());
        Assert.Equal("|а|б|", row.GetProperty("labelsKey").GetString());
        Assert.Equal(new[] { "а", "б" }, row.GetProperty("labels").EnumerateArray().Select(l => l.GetString()));
    }

    [Fact]
    public async Task LabelsKeyContainsFilterFindsTheLabelledRecord()
    {
        await _client.PutAsJsonAsync("/api/rows/77/labels?dataset=1000", new { labels = new[] { "а", "б" } });

        var json = await Query(("dataset","1000"),("filter","[\"labelsKey\",\"contains\",\"|а|\"]"));

        Assert.Contains(json.GetProperty("data").EnumerateArray(), r => r.GetProperty("id").GetInt32() == 77);
    }

    [Fact]
    public async Task UnknownDatasetIs400AndUnknownIdIs404()
    {
        var badDataset = await _client.PutAsJsonAsync("/api/rows/1/labels?dataset=7", new { labels = new[] { "а" } });
        Assert.Equal(HttpStatusCode.BadRequest, badDataset.StatusCode);
        Assert.False(string.IsNullOrEmpty(JsonDocument.Parse(await badDataset.Content.ReadAsStringAsync()).RootElement.GetProperty("message").GetString()));

        var badId = await _client.PutAsJsonAsync("/api/rows/1001/labels?dataset=1000", new { labels = new[] { "а" } });
        Assert.Equal(HttpStatusCode.NotFound, badId.StatusCode);
        Assert.False(string.IsNullOrEmpty(JsonDocument.Parse(await badId.Content.ReadAsStringAsync()).RootElement.GetProperty("message").GetString()));
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"labels\":[\"\"]}")]
    [InlineData("{\"labels\":[\"a|b\"]}")]
    [InlineData("not json")]
    public async Task InvalidLabelsBodyIs400(string body)
    {
        var response = await _client.PutAsync("/api/rows/1/labels?dataset=1000",
            new StringContent(body, System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    public static IEnumerable<object[]> RejectedLabelSets()
    {
        yield return new object[] { Enumerable.Range(1, 11).Select(i => $"я{i}").ToArray() };
        yield return new object[] { new[] { new string('я', 33) } };
        yield return new object[] { new[] { "а\u0001б" } };
        yield return new object[] { new[] { "а\tб" } };
        yield return new object[] { new[] { "=HYPERLINK(\"http://x\")" } };
        yield return new object[] { new[] { "+1" } };
        yield return new object[] { new[] { "-1" } };
        yield return new object[] { new[] { "@a" } };
    }

    [Theory]
    [MemberData(nameof(RejectedLabelSets))]
    public async Task TooManyTooLongControlOrFormulaLabelsAre400WithARussianMessage(string[] labels)
    {
        var response = await _client.PutAsJsonAsync("/api/rows/3/labels?dataset=1000", new { labels });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var message = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("message").GetString();
        Assert.Matches("[а-яА-Я]", message);
    }

    [Fact]
    public async Task TenLabelsOfThirtyTwoCharactersAreAccepted()
    {
        var labels = Enumerable.Range(0, 10).Select(i => new string((char)('а' + i), 32)).ToArray();

        var response = await _client.PutAsJsonAsync("/api/rows/4/labels?dataset=1000", new { labels });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var record = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.Equal(labels, record.GetProperty("labels").EnumerateArray().Select(l => l.GetString()));
    }

    [Fact]
    public void ConcurrentLabelUpdatesNeverLeaveATornPair()
    {
        var store = new DatasetStore(new DateOnly(2026, 10, 31));
        var sets = new[] { new[] { "а" }, new[] { "б", "в" }, Array.Empty<string>(), new[] { "г" } };

        Parallel.For(0, 20000, i => store.UpdateLabels(1000, 5, sets[i % sets.Length]));

        var record = store.Get(1000)[4];
        Assert.Equal(ProductionRecord.ToLabelsKey(record.Labels), record.LabelsKey);
    }

    [Fact]
    public void ReadersSeeEveryLabelPairConsistent()
    {
        var record = DataGenerator.Generate(1, new DateOnly(2026, 10, 31))[0];
        var a = new[] { "а" };
        var b = new[] { "б", "в" };
        using var stop = new CancellationTokenSource();
        var torn = 0;

        var readers = Enumerable.Range(0, 3).Select(_ => Task.Run(() =>
        {
            while (!stop.IsCancellationRequested)
            {
                var snapshot = record.LabelSet;
                if (ProductionRecord.ToLabelsKey(snapshot.Values) != snapshot.Key) Interlocked.Increment(ref torn);
            }
        })).ToArray();
        for (var i = 0; i < 200000; i++) record.Labels = i % 2 == 0 ? a : b;
        stop.Cancel();
        Task.WaitAll(readers);

        Assert.Equal(0, torn);
    }
}

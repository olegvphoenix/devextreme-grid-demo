using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace MockServer.Tests;

public class ColumnLimiterTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const int Permits = 8;
    private const int Queue = 32;

    private readonly WebApplicationFactory<Program> _factory;

    public ColumnLimiterTests(WebApplicationFactory<Program> factory) => _factory = factory;

    /// <summary>Параллельные запросы к колонке; X-Demo-Delay держит каждый из них на сервере.</summary>
    private Task<HttpResponseMessage>[] Burst(int count, string url, string field, int delayMs)
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Demo-Delay", delayMs.ToString());
        return Enumerable.Range(0, count)
            .Select(_ => ApiClient.PostForm(client, url, ("dataset", "1000"), ("field", field)))
            .ToArray();
    }

    [Theory]
    [InlineData("/api/distinct", "status")]
    [InlineData("/api/stats", "qty")]
    public async Task RequestsBeyondThePermitsAndTheQueueAre429WithMessage(string url, string field)
    {
        var responses = await Task.WhenAll(Burst(Permits + Queue + 1, url, field, 1000));

        Assert.Equal(Permits + Queue, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        var rejected = Assert.Single(responses, r => r.StatusCode == (HttpStatusCode)429);
        var json = JsonDocument.Parse(await rejected.Content.ReadAsStringAsync()).RootElement;
        Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));
    }

    [Fact]
    public async Task AGridPageOpeningSeveralListsAtOnceIsServed()
    {
        var responses = await Task.WhenAll(Burst(Permits + 4, "/api/distinct", "status", 300));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
    }

    [Fact]
    public async Task RowsQueriesAreNotCountedAgainstTheColumnLimiter()
    {
        var columns = Burst(Permits + 1, "/api/distinct", "status", 500);

        var page = await ApiClient.PostForm(_factory.CreateClient(), "/api/rows/query", ("dataset", "1000"), ("take", "1"));

        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        Assert.All(await Task.WhenAll(columns), r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
    }
}

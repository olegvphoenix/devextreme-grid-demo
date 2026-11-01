using System.Net;
using System.Text.Json;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using MockServer.Api;

namespace MockServer.Tests;

public class ColumnLimiterTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const int Permits = 8;
    private const int Queue = 32;

    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public ColumnLimiterTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    private Task<HttpResponseMessage>[] Burst(int count, string url, string field) =>
        Enumerable.Range(0, count)
            .Select(_ => ApiClient.PostForm(_client, url, ("dataset", "1000"), ("field", field)))
            .ToArray();

    /// <summary>Разрешения берутся у самого ограничителя, как слоты тяжёлых запросов в других тестах.</summary>
    private List<RateLimitLease> HoldAllPermits()
    {
        var limiter = _factory.Services.GetRequiredService<ColumnRequestLimiter>().Limiter;
        var leases = Enumerable.Range(0, Permits).Select(_ => limiter.AttemptAcquire()).ToList();
        Assert.All(leases, lease => Assert.True(lease.IsAcquired));
        Assert.False(limiter.AttemptAcquire().IsAcquired);
        return leases;
    }

    private async Task WaitForQueued(int count)
    {
        var limiter = _factory.Services.GetRequiredService<ColumnRequestLimiter>().Limiter;
        for (var i = 0; i < 500 && limiter.GetStatistics()?.CurrentQueuedCount < count; i++)
            await Task.Delay(10);
        Assert.Equal(count, limiter.GetStatistics()?.CurrentQueuedCount);
    }

    [Theory]
    [InlineData("/api/distinct", "status")]
    [InlineData("/api/stats", "qty")]
    public async Task RequestsBeyondThePermitsAndTheQueueAre429WithMessage(string url, string field)
    {
        var leases = HoldAllPermits();
        try
        {
            var queued = Burst(Queue, url, field);
            await WaitForQueued(Queue);

            var rejected = await ApiClient.PostForm(_client, url, ("dataset", "1000"), ("field", field));
            Assert.Equal((HttpStatusCode)429, rejected.StatusCode);
            var json = JsonDocument.Parse(await rejected.Content.ReadAsStringAsync()).RootElement;
            Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));

            leases.ForEach(lease => lease.Dispose());
            leases.Clear();
            Assert.All(await Task.WhenAll(queued), r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        }
        finally
        {
            leases.ForEach(lease => lease.Dispose());
        }
    }

    [Fact]
    public async Task AGridPageOpeningSeveralListsAtOnceIsServed()
    {
        var responses = await Task.WhenAll(Burst(Permits + 4, "/api/distinct", "status"));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
    }

    [Fact]
    public async Task RowsQueriesAreNotCountedAgainstTheColumnLimiter()
    {
        var leases = HoldAllPermits();
        try
        {
            var queued = Burst(Permits, "/api/distinct", "status");
            await WaitForQueued(Permits);

            var page = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "1000"), ("take", "1"));
            Assert.Equal(HttpStatusCode.OK, page.StatusCode);

            leases.ForEach(lease => lease.Dispose());
            leases.Clear();
            Assert.All(await Task.WhenAll(queued), r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
        }
        finally
        {
            leases.ForEach(lease => lease.Dispose());
        }
    }

    /// <summary>Задержка демо не должна держать разрешение: иначе один посетитель забирает списки у всех на минуту.</summary>
    [Fact]
    public async Task TheDemoDelayDoesNotHoldAPermit()
    {
        var limiter = _factory.Services.GetRequiredService<ColumnRequestLimiter>().Limiter;
        var delayed = _factory.CreateClient();
        delayed.DefaultRequestHeaders.Add("X-Demo-Delay", "1500");
        var sleeping = Enumerable.Range(0, Permits + Queue)
            .Select(_ => ApiClient.PostForm(delayed, "/api/distinct", ("dataset", "1000"), ("field", "status")))
            .ToArray();
        await Task.Delay(300);

        Assert.Equal(0, limiter.GetStatistics()?.CurrentQueuedCount);
        var plain = await ApiClient.PostForm(_client, "/api/distinct", ("dataset", "1000"), ("field", "status"));
        Assert.Equal(HttpStatusCode.OK, plain.StatusCode);
        Assert.All(await Task.WhenAll(sleeping), r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
    }
}

using System.Diagnostics;
using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace MockServer.Tests;

public class DemoHeadersTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public DemoHeadersTests(WebApplicationFactory<Program> factory) => _client = factory.CreateClient();

    [Fact]
    public async Task DemoFailReturns500WithMessage()
    {
        _client.DefaultRequestHeaders.Add("X-Demo-Fail", "1");

        var response = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "1000"), ("take", "1"));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));
    }

    [Fact]
    public async Task DemoFailDoesNotAffectHealth()
    {
        _client.DefaultRequestHeaders.Add("X-Demo-Fail", "1");
        var response = await _client.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task DemoFailAppliesToDatasets()
    {
        _client.DefaultRequestHeaders.Add("X-Demo-Fail", "1");
        var response = await _client.GetAsync("/api/datasets");
        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
    }

    [Fact]
    public async Task DemoDelayHoldsTheResponse()
    {
        await _client.GetAsync("/api/datasets");
        var baseline = await Time(() => _client.GetAsync("/api/datasets"));

        _client.DefaultRequestHeaders.Add("X-Demo-Delay", "200");
        var delayed = await Time(() => _client.GetAsync("/api/datasets"));

        Assert.True(delayed >= 200, $"delayed request answered after {delayed} ms");
        Assert.True(delayed - baseline >= 150, $"baseline {baseline} ms, with X-Demo-Delay {delayed} ms");
    }

    private static async Task<long> Time(Func<Task<HttpResponseMessage>> request)
    {
        var sw = Stopwatch.StartNew();
        var response = await request();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return sw.ElapsedMilliseconds;
    }

    [Fact]
    public async Task InvalidDelayIsIgnored()
    {
        _client.DefaultRequestHeaders.Add("X-Demo-Delay", "soon");
        var response = await _client.GetAsync("/api/datasets");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}

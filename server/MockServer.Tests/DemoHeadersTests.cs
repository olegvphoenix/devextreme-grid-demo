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
        _client.DefaultRequestHeaders.Add("X-Demo-Delay", "200");
        var sw = Stopwatch.StartNew();

        var response = await _client.GetAsync("/api/datasets");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(sw.ElapsedMilliseconds >= 200, $"answered after {sw.ElapsedMilliseconds} ms");
    }

    [Fact]
    public async Task InvalidDelayIsIgnored()
    {
        _client.DefaultRequestHeaders.Add("X-Demo-Delay", "soon");
        var response = await _client.GetAsync("/api/datasets");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}

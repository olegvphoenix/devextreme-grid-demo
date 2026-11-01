using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;

namespace MockServer.Tests;

public class SecurityHeadersTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public SecurityHeadersTests(WebApplicationFactory<Program> factory) => _client = factory.CreateClient();

    private static void AssertHardened(HttpResponseMessage response)
    {
        Assert.Equal("nosniff", Assert.Single(response.Headers.GetValues("X-Content-Type-Options")));
        Assert.Equal("DENY", Assert.Single(response.Headers.GetValues("X-Frame-Options")));
        Assert.Equal("no-referrer", Assert.Single(response.Headers.GetValues("Referrer-Policy")));
    }

    [Fact]
    public async Task ApiResponsesCarryTheHardeningHeaders()
    {
        AssertHardened(await _client.GetAsync("/api/health"));
        AssertHardened(await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "1000"), ("take", "1")));
    }

    [Fact]
    public async Task ErrorResponsesCarryThemToo()
    {
        var notFound = await _client.GetAsync("/api/nope");
        Assert.Equal(HttpStatusCode.NotFound, notFound.StatusCode);
        AssertHardened(notFound);

        var badRequest = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "7"), ("take", "1"));
        Assert.Equal(HttpStatusCode.BadRequest, badRequest.StatusCode);
        AssertHardened(badRequest);
    }
}

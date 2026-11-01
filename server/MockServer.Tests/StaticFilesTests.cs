using System.Net;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace MockServer.Tests;

public class StaticFilesTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private const string IndexHtml = "<!doctype html><title>demo</title>";

    private readonly string _webRoot = Directory.CreateTempSubdirectory("grid-demo-wwwroot").FullName;
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public StaticFilesTests(WebApplicationFactory<Program> factory)
    {
        File.WriteAllText(Path.Combine(_webRoot, "index.html"), IndexHtml);
        _factory = factory.WithWebHostBuilder(builder => builder.UseWebRoot(_webRoot));
        _client = _factory.CreateClient();
    }

    public void Dispose()
    {
        _factory.Dispose();
        Directory.Delete(_webRoot, recursive: true);
    }

    [Theory]
    [InlineData("/")]
    [InlineData("/grid")]
    [InlineData("/settings")]
    public async Task ClientRoutesReturnIndexHtml(string path)
    {
        var response = await _client.GetAsync(path);

        response.EnsureSuccessStatusCode();
        Assert.Equal(IndexHtml, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task UnknownApiPathIsNotFound()
    {
        var response = await _client.GetAsync("/api/unknown");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ApiStillAnswers()
    {
        var response = await _client.GetAsync("/api/health");

        response.EnsureSuccessStatusCode();
    }
}

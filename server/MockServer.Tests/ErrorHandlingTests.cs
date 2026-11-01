using System.Net;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace MockServer.Tests;

public class ErrorHandlingTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly CapturingLoggerProvider _log = new();
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public ErrorHandlingTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(builder =>
            builder.ConfigureLogging(logging => logging.Services.AddSingleton<ILoggerProvider>(_log)));
        _client = _factory.CreateClient();
    }

    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task UnexpectedExceptionIs500WithGenericMessageAndIsLogged()
    {
        var response = await ApiClient.PostForm(_client, "/api/rows/query",
            ("dataset", "1000"), ("take", "1"), ("filter", "[\"qty\",\"between\",[1,2]]"));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        var body = await response.Content.ReadAsStringAsync();
        var json = JsonDocument.Parse(body).RootElement;
        Assert.Equal("Внутренняя ошибка сервера", json.GetProperty("message").GetString());
        Assert.DoesNotContain("not supported", body, StringComparison.OrdinalIgnoreCase);
        var logged = Assert.Single(_log.Entries, e => e.Level == LogLevel.Error);
        Assert.NotNull(logged.Exception);
        Assert.Contains("not supported", logged.Exception!.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task BadRequestKeepsItsMessage()
    {
        var dataset = await ApiClient.PostForm(_client, "/api/rows/query", ("dataset", "5"), ("take", "1"));
        var sort = await ApiClient.PostForm(_client, "/api/rows/query",
            ("dataset", "1000"), ("take", "1"), ("sort", "[{selector:date}]"));

        Assert.Equal(HttpStatusCode.BadRequest, dataset.StatusCode);
        Assert.Contains("dataset", await Message(dataset));
        Assert.Equal(HttpStatusCode.BadRequest, sort.StatusCode);
        Assert.NotEqual("Внутренняя ошибка сервера", await Message(sort));
    }

    private static async Task<string> Message(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetProperty("message").GetString()!;

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        public List<(LogLevel Level, Exception? Exception)> Entries { get; } = new();

        public ILogger CreateLogger(string categoryName) => new Logger(Entries);

        public void Dispose()
        {
        }

        private sealed class Logger : ILogger
        {
            private readonly List<(LogLevel, Exception?)> _entries;

            public Logger(List<(LogLevel, Exception?)> entries) => _entries = entries;

            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Error;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                lock (_entries) _entries.Add((logLevel, exception));
            }
        }
    }
}

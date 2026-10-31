namespace MockServer.Api;

public sealed class DemoHeadersMiddleware
{
    private const int MaxDelayMs = 60_000;
    private readonly RequestDelegate _next;

    public DemoHeadersMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path;
        if (!path.StartsWithSegments("/api") || path.StartsWithSegments("/api/health"))
        {
            await _next(context);
            return;
        }

        if (int.TryParse(context.Request.Headers["X-Demo-Delay"], out var delayMs) && delayMs > 0)
            await Task.Delay(Math.Min(delayMs, MaxDelayMs), context.RequestAborted);

        if (context.Request.Headers["X-Demo-Fail"] == "1")
        {
            context.Response.StatusCode = StatusCodes.Status500InternalServerError;
            await context.Response.WriteAsJsonAsync(new { message = "Демонстрационный сбой сервера (X-Demo-Fail)" });
            return;
        }

        await _next(context);
    }
}

namespace MockServer.Api;

/// <summary>
/// Заголовки для открытого хоста: без угадывания типа, без встраивания во фреймы, без Referer
/// наружу. Ставятся перед отправкой ответа, поэтому переживают сброс ответа обработчиком ошибок.
/// </summary>
public sealed class SecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;

    public SecurityHeadersMiddleware(RequestDelegate next) => _next = next;

    public Task InvokeAsync(HttpContext context)
    {
        context.Response.OnStarting(static state =>
        {
            var headers = ((HttpContext)state).Response.Headers;
            headers.XContentTypeOptions = "nosniff";
            headers.XFrameOptions = "DENY";
            headers["Referrer-Policy"] = "no-referrer";
            return Task.CompletedTask;
        }, context);
        return _next(context);
    }
}

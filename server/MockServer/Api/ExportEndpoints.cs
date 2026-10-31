using Microsoft.AspNetCore.Http.Features;
using MockServer.Data;
using MockServer.Export;

namespace MockServer.Api;

public static class ExportEndpoints
{
    public static void MapExport(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/export/xlsx", Xlsx);
        app.MapPost("/api/export/pdf", Pdf);
    }

    private static Task Xlsx(HttpContext context, DatasetStore store, HeavyRequestLimiter limiter) =>
        Export(context, store, limiter, "xlsx", XlsxExporter.ContentType, (request, rows, response, cancellationToken) =>
        {
            var body = response.HttpContext.Features.Get<IHttpBodyControlFeature>();
            if (body is not null) body.AllowSynchronousIO = true;
            return XlsxExporter.Write(request, rows, response.Body, cancellationToken);
        });

    private static Task Pdf(HttpContext context, DatasetStore store, HeavyRequestLimiter limiter) =>
        Export(context, store, limiter, "pdf", PdfExporter.ContentType, async (request, rows, response, cancellationToken) =>
        {
            using var pdf = PdfExporter.Build(request, rows, cancellationToken);
            response.ContentLength = pdf.Length;
            await pdf.CopyToAsync(response.Body, cancellationToken);
        });

    private static async Task Export(
        HttpContext context,
        DatasetStore store,
        HeavyRequestLimiter limiter,
        string extension,
        string contentType,
        Func<ExportRequest, IEnumerable<ProductionRecord>, HttpResponse, CancellationToken, Task> write)
    {
        var request = ExportRequest.Read(await LoadOptionsReader.ReadForm(context.Request));

        if (!limiter.TryEnter(out var lease))
        {
            context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            await context.Response.WriteAsJsonAsync(new { message = HeavyRequestLimiter.BusyMessage });
            return;
        }

        using (lease)
        {
            context.Response.ContentType = contentType;
            context.Response.Headers.ContentDisposition = $"attachment; filename=\"export.{extension}\"";
            await write(request, request.Rows(store), context.Response, context.RequestAborted);
        }
    }
}

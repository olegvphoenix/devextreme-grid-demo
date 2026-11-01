using System.Text.Json;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Extensions.Options;
using MockServer.Data;

namespace MockServer.Api;

public sealed record LabelsBody(string[]? Labels);

public static class RowsEndpoints
{
    public static void MapRows(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/rows/query", Query);
        app.MapPut("/api/rows/{id:int}/labels", UpdateLabels);
    }

    private static async Task Query(
        HttpContext context, DatasetStore store, HeavyRequestLimiter limiter, IOptions<JsonOptions> json)
    {
        var (dataset, options) = LoadOptionsReader.Read(await LoadOptionsReader.ReadForm(context.Request));

        IDisposable? lease = null;
        if (HeavyRequestLimiter.IsHeavy(options) && !limiter.TryEnter(out lease))
        {
            context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
            await context.Response.WriteAsJsonAsync(new { message = HeavyRequestLimiter.BusyMessage });
            return;
        }

        using (lease)
        {
            var result = RowsQuery.Load(store.Get(dataset).AsQueryable(), options);
            context.Response.ContentType = "application/json; charset=utf-8";
            await JsonSerializer.SerializeAsync(
                context.Response.Body, result, json.Value.SerializerOptions, context.RequestAborted);
        }
    }

    private static IResult UpdateLabels(int id, string? dataset, LabelsBody body, DatasetStore store)
    {
        var size = LoadOptionsReader.ReadDataset(dataset);
        LabelRules.Validate(body.Labels);
        try
        {
            return Results.Ok(store.UpdateLabels(size, id, body.Labels!));
        }
        catch (KeyNotFoundException e)
        {
            return Results.NotFound(new { message = e.Message });
        }
        catch (LabelOverlayFullException e)
        {
            return Results.Conflict(new { message = e.Message });
        }
    }
}

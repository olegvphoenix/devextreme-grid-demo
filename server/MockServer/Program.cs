using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics;
using MockServer.Api;
using MockServer.Data;

if (args.Length > 0 && args[0] == "generate")
{
    if (args.Length < 3 || !int.TryParse(args[1], out var size) || size <= 0)
    {
        Console.Error.WriteLine("Usage: generate <size> <path.csv>");
        return 1;
    }

    var rows = DataGenerator.Generate(size, DateOnly.FromDateTime(DateTime.Now));
    using (var file = new StreamWriter(args[2]))
        CsvWriter.Write(rows, file);
    Console.WriteLine($"Wrote {rows.Length} rows to {args[2]}");
    return 0;
}

var builder = WebApplication.CreateBuilder(args);
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new DateJsonConverter()));
builder.Services.AddSingleton(new DatasetStore(DateOnly.FromDateTime(DateTime.Now)));
builder.Services.AddSingleton(new HeavyRequestLimiter(maxConcurrent: 2));

var app = builder.Build();

app.UseExceptionHandler(errors => errors.Run(async context =>
{
    var error = context.Features.Get<IExceptionHandlerFeature>()?.Error;
    context.Response.StatusCode = error switch
    {
        BadHttpRequestException bad => bad.StatusCode,
        JsonException => StatusCodes.Status400BadRequest,
        _ => StatusCodes.Status500InternalServerError,
    };
    await context.Response.WriteAsJsonAsync(new { message = error?.Message ?? "Внутренняя ошибка сервера" });
}));
app.UseMiddleware<DemoHeadersMiddleware>();
app.UseDefaultFiles();
app.UseStaticFiles();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
app.MapGet("/api/datasets", (DatasetStore store) => store.Describe());
app.MapRows();
app.MapColumns();
app.MapExport();
app.MapFallback("/api/{**path}", () => Results.NotFound());
app.MapFallbackToFile("index.html");

app.Run();
return 0;

public partial class Program { }

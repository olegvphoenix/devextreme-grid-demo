using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using MiniExcelLibs;
using MockServer.Api;
using MockServer.Export;
using PdfSharp.Pdf.IO;

namespace MockServer.Tests;

public class ExportApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private const string Columns = "[{\"field\":\"date\",\"caption\":\"Дата\"},{\"field\":\"status\",\"caption\":\"Статус\"}]";

    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public ExportApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
        _client = factory.CreateClient();
    }

    private async Task<byte[]> Export(string kind, params (string, string)[] fields)
    {
        var response = await ApiClient.PostForm(_client, $"/api/export/{kind}", fields);
        Assert.True(response.IsSuccessStatusCode, $"{(int)response.StatusCode}: {await response.Content.ReadAsStringAsync()}");
        return await response.Content.ReadAsByteArrayAsync();
    }

    private static List<IDictionary<string, object>> ReadXlsx(byte[] bytes)
    {
        using var stream = new MemoryStream(bytes);
        return stream.Query(useHeaderRow: true).Cast<IDictionary<string, object>>().ToList();
    }

    [Fact] public async Task XlsxContainsAllRowsOfFilterNotJustAPage()
    {
        var bytes = await Export("xlsx",("dataset","1000"),("columns",Columns),("filter","[\"status\",\"=\",1]"),("take","10"));
        using var stream = new MemoryStream(bytes);
        var rows = stream.Query(useHeaderRow: true).Cast<IDictionary<string, object>>().ToList();
        Assert.True(rows.Count > 10);
        Assert.All(rows, r => Assert.Equal("В работе", r["Статус"]));
    }

    [Fact] public async Task XlsxUsesColumnsAndOrderOfCurrentView()
    {
        var bytes = await Export("xlsx",("dataset","1000"),("columns",Columns),("sort","[{\"selector\":\"date\",\"desc\":true}]"));
        using var stream = new MemoryStream(bytes);
        var rows = stream.Query(useHeaderRow: true).Cast<IDictionary<string, object>>().ToList();
        Assert.Equal(new[] { "Дата", "Статус" }, rows[0].Keys);
        var dates = rows.Select(r => DateTime.ParseExact((string)r["Дата"], "dd.MM.yyyy", null)).ToList();
        Assert.Equal(dates.OrderByDescending(d => d), dates);
    }

    [Fact] public async Task GroupFieldsDefineRowOrder()
    {
        var bytes = await Export("xlsx",("dataset","1000"),
            ("columns","[{\"field\":\"plant\",\"caption\":\"Завод\"}]"),
            ("group","[{\"selector\":\"plant\",\"desc\":false}]"));
        using var stream = new MemoryStream(bytes);
        var plants = stream.Query(useHeaderRow: true).Cast<IDictionary<string, object>>().Select(r => (string)r["Завод"]).ToList();
        Assert.Equal(plants.OrderBy(p => p, StringComparer.Ordinal), plants);
    }

    [Fact] public async Task PdfIsValidAndHasManyPagesWithCyrillic()
    {
        var bytes = await Export("pdf",("dataset","1000"),("columns",Columns));
        Assert.StartsWith("%PDF", System.Text.Encoding.ASCII.GetString(bytes, 0, 4));
        using var doc = PdfReader.Open(new MemoryStream(bytes), PdfDocumentOpenMode.Import);
        Assert.True(doc.PageCount >= 1000 / 50);

        var fonts = doc.Pages[0].Resources.Elements.GetDictionary("/Font")!;
        var baseFonts = fonts.Elements.Keys
            .Select(key => fonts.Elements.GetDictionary(key)!.Elements.GetName("/BaseFont"))
            .ToList();
        Assert.NotEmpty(baseFonts);
        Assert.All(baseFonts, name => Assert.EndsWith("+DejaVu Sans", name));
        var encodings = fonts.Elements.Keys.Select(key => fonts.Elements.GetDictionary(key)!.Elements.GetName("/Subtype"));
        Assert.All(encodings, subtype => Assert.Equal("/Type0", subtype));
    }

    [Fact]
    public async Task EmptyResultStillHasTheHeaderRow()
    {
        var bytes = await Export("xlsx", ("dataset", "1000"), ("columns", Columns), ("filter", "[\"id\",\"=\",0]"));

        using var stream = new MemoryStream(bytes);
        var rows = stream.Query(useHeaderRow: false).Cast<IDictionary<string, object>>().ToList();
        var header = Assert.Single(rows);
        Assert.Equal(new object[] { "Дата", "Статус" }, header.Values.ToArray());
    }

    [Fact]
    public async Task GroupFieldsComeBeforeSortFields()
    {
        var bytes = await Export("xlsx", ("dataset", "1000"),
            ("columns", "[{\"field\":\"status\",\"caption\":\"Статус\"},{\"field\":\"id\",\"caption\":\"Ид\"}]"),
            ("group", "[{\"selector\":\"status\",\"desc\":true}]"),
            ("sort", "[{\"selector\":\"id\",\"desc\":false}]"));

        var rows = ReadXlsx(bytes);
        var statuses = rows.Select(r => (string)r["Статус"]).ToList();
        var statusRank = statuses.Select(s => Array.IndexOf(MockServer.Data.Catalog.StatusNames, s)).ToList();
        Assert.Equal(statusRank.OrderByDescending(s => s), statusRank);
        foreach (var group in rows.GroupBy(r => r["Статус"]))
        {
            var ids = group.Select(r => int.Parse(((string)r["Ид"]).Replace(" ", ""))).ToList();
            Assert.Equal(ids.OrderBy(i => i), ids);
        }
    }

    [Fact]
    public async Task SkipAndTakeAreIgnoredAndEveryRowIsExported()
    {
        var bytes = await Export("xlsx", ("dataset", "1000"), ("columns", Columns), ("skip", "990"), ("take", "10"));

        Assert.Equal(1000, ReadXlsx(bytes).Count);
    }

    [Fact]
    public async Task LabelsAreExportedAsACommaJoinedString()
    {
        await _client.PutAsJsonAsync("/api/rows/7/labels?dataset=1000", new { labels = new[] { "срочно", "брак" } });

        var bytes = await Export("xlsx", ("dataset", "1000"),
            ("columns", "[{\"field\":\"labels\",\"caption\":\"Ярлыки\"}]"),
            ("filter", "[\"id\",\"=\",7]"));

        var row = Assert.Single(ReadXlsx(bytes));
        Assert.Equal("срочно, брак", row["Ярлыки"]);
    }

    [Fact]
    public async Task XlsxResponseIsADownload()
    {
        var response = await ApiClient.PostForm(_client, "/api/export/xlsx", ("dataset", "1000"), ("columns", Columns));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition?.DispositionType);
        Assert.EndsWith(".xlsx", response.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
    }

    [Fact]
    public async Task PdfResponseIsADownload()
    {
        var response = await ApiClient.PostForm(_client, "/api/export/pdf", ("dataset", "1000"), ("columns", Columns));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("attachment", response.Content.Headers.ContentDisposition?.DispositionType);
        Assert.EndsWith(".pdf", response.Content.Headers.ContentDisposition?.FileName?.Trim('"'));
    }

    [Fact]
    public async Task PdfWithEveryColumnIncludingTheLongMarkingCodeIsBuilt()
    {
        var columns = string.Join(",", new[]
        {
            "id", "date", "plant", "line", "product", "batch", "netWeight", "grossWeight", "qty", "markingCode", "ean13", "status", "operator", "labels",
        }.Select(f => $"{{\"field\":\"{f}\",\"caption\":\"{f}\"}}"));

        var bytes = await Export("pdf", ("dataset", "1000"), ("columns", $"[{columns}]"), ("filter", "[\"id\",\"<=\",100]"));

        using var doc = PdfReader.Open(new MemoryStream(bytes), PdfDocumentOpenMode.Import);
        Assert.Equal(3, doc.PageCount);
    }

    [Fact]
    public void FitKeepsTextThatIsNarrowEnough()
    {
        Assert.Equal("abc", PdfExporter.Fit("abc", 30, c => 10));
    }

    [Fact]
    public void FitCutsTooLongTextToAPrefixWithAnEllipsisWithinTheWidth()
    {
        var fitted = PdfExporter.Fit("0104600000000012215ABCD1F", 100, c => c == '…' ? 10 : 7);

        Assert.EndsWith("…", fitted);
        Assert.StartsWith(fitted.TrimEnd('…'), "0104600000000012215ABCD1F");
        Assert.True(fitted.Sum(c => c == '…' ? 10 : 7) <= 100);
        Assert.Equal("010460000000…", fitted);
    }

    [Fact]
    public void ColumnWidthsAreScaledUpProportionallyWhenEverythingFits()
    {
        Assert.Equal(new[] { 100.0, 300.0 }, PdfExporter.Allocate(new[] { 10.0, 30.0 }, 400));
    }

    [Fact]
    public void AWideColumnIsCutBeforeNarrowColumnsLoseTheirWidth()
    {
        var widths = PdfExporter.Allocate(new[] { 40.0, 500.0, 60.0 }, 300);

        Assert.Equal(new[] { 40.0, 200.0, 60.0 }, widths);
    }

    [Fact]
    public void SeveralWideColumnsShareTheRestProportionally()
    {
        var widths = PdfExporter.Allocate(new[] { 20.0, 300.0, 150.0 }, 220);

        Assert.Equal(20.0, widths[0]);
        Assert.Equal(400.0 / 3, widths[1], 6);
        Assert.Equal(200.0 / 3, widths[2], 6);
        Assert.Equal(220.0, widths.Sum(), 6);
    }

    [Fact]
    public void FitGivesAnEmptyStringWhenEvenTheEllipsisDoesNotFit()
    {
        Assert.Equal("", PdfExporter.Fit("abc", 5, c => 10));
    }

    [Theory]
    [InlineData("xlsx", "[]")]
    [InlineData("pdf", "[]")]
    [InlineData("xlsx", null)]
    [InlineData("xlsx", "[{\"field\":\"labelsKey\",\"caption\":\"x\"}]")]
    [InlineData("pdf", "[{\"field\":\"nope\",\"caption\":\"x\"}]")]
    [InlineData("xlsx", "not json")]
    public async Task EmptyUnknownOrBrokenColumnsAre400WithMessage(string kind, string? columns)
    {
        var fields = columns is null ? new[] { ("dataset", "1000") } : new[] { ("dataset", "1000"), ("columns", columns) };
        var response = await ApiClient.PostForm(_client, $"/api/export/{kind}", fields);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement;
        Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));
    }

    [Theory]
    [InlineData("xlsx")]
    [InlineData("pdf")]
    public async Task ExportIs429WhenTheLimiterIsFull(string kind)
    {
        var limiter = _factory.Services.GetRequiredService<HeavyRequestLimiter>();
        Assert.True(limiter.TryEnter(out var first));
        Assert.True(limiter.TryEnter(out var second));
        try
        {
            var busy = await ApiClient.PostForm(_client, $"/api/export/{kind}", ("dataset", "1000"), ("columns", Columns));
            Assert.Equal((HttpStatusCode)429, busy.StatusCode);
            var json = JsonDocument.Parse(await busy.Content.ReadAsStringAsync()).RootElement;
            Assert.False(string.IsNullOrEmpty(json.GetProperty("message").GetString()));
        }
        finally
        {
            first.Dispose();
            second.Dispose();
        }

        var afterRelease = await ApiClient.PostForm(_client, $"/api/export/{kind}", ("dataset", "1000"), ("columns", Columns));
        Assert.Equal(HttpStatusCode.OK, afterRelease.StatusCode);
    }
}

using MockServer.Data;
using PdfSharp;
using PdfSharp.Drawing;
using PdfSharp.Fonts;
using PdfSharp.Pdf;

namespace MockServer.Export;

internal static class PdfExporter
{
    public const string ContentType = "application/pdf";

    private const int RowsPerPage = 45;
    private const char Ellipsis = '…';
    private const double Margin = 24;
    private const double HeaderHeight = 14;
    private const double RowHeight = 11;
    private const double CellPadding = 2;
    private const double FontSize = 7.5;

    static PdfExporter() => GlobalFontSettings.FontResolver = DejaVuFontResolver.Instance;

    public static MemoryStream Build(ExportRequest request, IEnumerable<ProductionRecord> rows, CancellationToken cancellationToken)
    {
        var columns = request.Columns;
        var pages = rows.Chunk(RowsPerPage).ToList();
        if (pages.Count == 0)
            pages.Add(Array.Empty<ProductionRecord>());

        using var document = new PdfDocument();
        document.Options.CompressContentStreams = true;
        var font = new XFont(DejaVuFontResolver.FamilyName, FontSize, XFontStyleEx.Regular, new XPdfFontOptions(PdfFontEncoding.Unicode));
        var pen = new XPen(XColors.Gray, 0.5);
        var measurer = new CharWidths(font);
        double[]? widths = null;

        for (var index = 0; index < pages.Count; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var page = document.AddPage();
            page.Size = PageSize.A4;
            page.Orientation = PageOrientation.Landscape;
            using var gfx = XGraphics.FromPdfPage(page);
            measurer.Graphics = gfx;
            double pageWidth = page.Width.Point, pageHeight = page.Height.Point;
            widths ??= ColumnWidths(measurer, columns, pages[0], pageWidth - 2 * Margin);

            var y = Margin;
            DrawRow(gfx, font, measurer, widths, columns.Select(c => c.Caption), y, HeaderHeight);
            y += HeaderHeight;
            gfx.DrawLine(pen, Margin, y, pageWidth - Margin, y);

            foreach (var row in pages[index])
            {
                DrawRow(gfx, font, measurer, widths, columns.Select(c => c.Text(row)), y, RowHeight);
                y += RowHeight;
            }

            gfx.DrawString($"Стр. {index + 1} из {pages.Count}", font, XBrushes.Black,
                new XRect(Margin, pageHeight - Margin - RowHeight, pageWidth - 2 * Margin, RowHeight), XStringFormats.Center);
        }

        var output = new MemoryStream();
        document.Save(output, closeStream: false);
        output.Position = 0;
        return output;
    }

    public static string Fit(string text, double maxWidth, Func<char, double> width)
    {
        if (Width(text, width) <= maxWidth)
            return text;

        var budget = maxWidth - width(Ellipsis);
        if (budget < 0)
            return "";

        double used = 0;
        var length = 0;
        foreach (var c in text)
        {
            var next = used + width(c);
            if (next > budget) break;
            used = next;
            length++;
        }

        return text[..length] + Ellipsis;
    }

    private static double Width(string text, Func<char, double> width)
    {
        double total = 0;
        foreach (var c in text) total += width(c);
        return total;
    }

    private static void DrawRow(
        XGraphics gfx, XFont font, CharWidths measurer, double[] widths, IEnumerable<string> cells, double y, double height)
    {
        var x = Margin;
        var i = 0;
        foreach (var cell in cells)
        {
            var inner = widths[i] - 2 * CellPadding;
            gfx.DrawString(Fit(cell, inner, measurer.Width), font, XBrushes.Black,
                new XRect(x + CellPadding, y, inner, height), XStringFormats.TopLeft);
            x += widths[i++];
        }
    }

    public static double[] Allocate(double[] raw, double total)
    {
        if (raw.Sum() <= total)
        {
            var scale = total / raw.Sum();
            return raw.Select(w => w * scale).ToArray();
        }

        var widths = new double[raw.Length];
        var open = Enumerable.Range(0, raw.Length).ToList();
        var remaining = total;
        while (true)
        {
            var share = remaining / open.Count;
            var fitting = open.Where(i => raw[i] <= share).ToList();
            if (fitting.Count == 0) break;
            foreach (var i in fitting)
            {
                widths[i] = raw[i];
                remaining -= raw[i];
                open.Remove(i);
            }
        }

        var shrink = remaining / open.Sum(i => raw[i]);
        foreach (var i in open)
            widths[i] = raw[i] * shrink;
        return widths;
    }

    private static double[] ColumnWidths(CharWidths measurer, IReadOnlyList<ExportColumn> columns, ProductionRecord[] sample, double total)
    {
        var raw = columns
            .Select(c => sample.Select(c.Text).Append(c.Caption).Max(text => Width(text, measurer.Width)) + 2 * CellPadding)
            .ToArray();
        return Allocate(raw, total);
    }

    private sealed class CharWidths
    {
        private readonly XFont _font;
        private readonly Dictionary<char, double> _widths = new();

        public CharWidths(XFont font) => _font = font;

        public XGraphics Graphics { get; set; } = null!;

        public double Width(char c)
        {
            if (!_widths.TryGetValue(c, out var width))
                _widths[c] = width = Graphics.MeasureString(c.ToString(), _font).Width;
            return width;
        }
    }
}

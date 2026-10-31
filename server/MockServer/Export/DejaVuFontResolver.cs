using PdfSharp.Fonts;

namespace MockServer.Export;

internal sealed class DejaVuFontResolver : IFontResolver
{
    public const string FamilyName = "DejaVu Sans";
    private const string FaceName = "DejaVuSans";
    private const string ResourceName = "DejaVuSans.ttf";

    public static readonly DejaVuFontResolver Instance = new();

    private static readonly Lazy<byte[]> FontBytes = new(LoadFont);

    private DejaVuFontResolver() { }

    public FontResolverInfo ResolveTypeface(string familyName, bool bold, bool italic) =>
        new(FaceName, bold, italic);

    public byte[]? GetFont(string faceName) => faceName == FaceName ? FontBytes.Value : null;

    private static byte[] LoadFont()
    {
        using var stream = typeof(DejaVuFontResolver).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Embedded resource {ResourceName} is missing");
        using var buffer = new MemoryStream();
        stream.CopyTo(buffer);
        return buffer.ToArray();
    }
}

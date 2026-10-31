using System.Globalization;
using MockServer.Data;

namespace MockServer.Api;

public static class ValueFormatter
{
    private static readonly CultureInfo Ru = CultureInfo.GetCultureInfo("ru-RU");

    public static string Text(string field, object? value) => (field, value) switch
    {
        (_, null) => "",
        ("status", int code) when code >= 0 && code < Catalog.StatusNames.Length => Catalog.StatusNames[code],
        ("date", DateTime date) => date.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture),
        ("netWeight" or "grossWeight", double weight) => weight.ToString("N1", Ru),
        ("qty" or "id", int number) => number.ToString("N0", Ru),
        _ => Convert.ToString(value, CultureInfo.InvariantCulture) ?? "",
    };
}

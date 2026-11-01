using DevExtreme.AspNet.Data;
using DevExtreme.AspNet.Data.Helpers;
using MockServer.Data;

namespace MockServer.Api;

public static class LoadOptionsReader
{
    public static Task<IFormCollection> ReadForm(HttpRequest request)
    {
        if (!request.HasFormContentType)
            throw new BadHttpRequestException("Ожидается тело application/x-www-form-urlencoded");
        return request.ReadFormAsync();
    }

    public static (int Dataset, DataSourceLoadOptionsBase Options) Read(IFormCollection form) =>
        Read(form, key => form[key]);

    public static (int Dataset, DataSourceLoadOptionsBase Options) ReadFilterOnly(IFormCollection form) =>
        Read(form, key => key == "filter" ? (string?)form[key] : null);

    public static int ReadDataset(string? value)
    {
        if (int.TryParse(value, out var size) && DatasetStore.Sizes.Contains(size))
            return size;
        throw new BadHttpRequestException(
            $"Параметр dataset обязателен и принимает значения {string.Join(", ", DatasetStore.Sizes)}");
    }

    private static (int Dataset, DataSourceLoadOptionsBase Options) Read(IFormCollection form, Func<string, string?> value)
    {
        var options = new DataSourceLoadOptionsBase { StringToLower = true };
        DataSourceLoadOptionsParser.Parse(options, value);
        var operands = ValueListFilter.CountOperands(options.Filter);
        if (operands > ValueListFilter.MaxOperands)
            throw new BadHttpRequestException($"В фильтре {operands} условий, допускается не более {ValueListFilter.MaxOperands}");
        return (ReadDataset(form["dataset"]), options);
    }
}

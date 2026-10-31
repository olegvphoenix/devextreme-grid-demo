using DevExtreme.AspNet.Data;
using DevExtreme.AspNet.Data.Helpers;
using MockServer.Data;

namespace MockServer.Api;

public static class LoadOptionsReader
{
    public static (int Dataset, DataSourceLoadOptionsBase Options) Read(IFormCollection form)
    {
        var options = new DataSourceLoadOptionsBase { StringToLower = true };
        DataSourceLoadOptionsParser.Parse(options, key => form[key]);
        return (ReadDataset(form["dataset"]), options);
    }

    public static int ReadDataset(string? value)
    {
        if (int.TryParse(value, out var size) && DatasetStore.Sizes.Contains(size))
            return size;
        throw new BadHttpRequestException(
            $"Параметр dataset обязателен и принимает значения {string.Join(", ", DatasetStore.Sizes)}");
    }
}

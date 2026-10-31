using System.Globalization;
using MockServer.Api;

namespace MockServer.Tests;

public class ValueFormatterTests
{
    private static readonly string Group = CultureInfo.GetCultureInfo("ru-RU").NumberFormat.NumberGroupSeparator;

    [Theory]
    [InlineData("netWeight")]
    [InlineData("grossWeight")]
    public void WeightsUseRussianGroupingAndDecimalComma(string field)
    {
        Assert.Equal($"1{Group}234,5", ValueFormatter.Text(field, 1234.5));
        Assert.Equal("7,0", ValueFormatter.Text(field, 7.0));
    }

    [Theory]
    [InlineData("qty")]
    [InlineData("id")]
    public void IntegersUseRussianGroupingWithoutDecimals(string field)
    {
        Assert.Equal($"1{Group}234", ValueFormatter.Text(field, 1234));
        Assert.Equal("7", ValueFormatter.Text(field, 7));
    }

    [Fact]
    public void StatusShowsItsRussianName()
    {
        Assert.Equal("В работе", ValueFormatter.Text("status", 1));
        Assert.Equal("Закрыт", ValueFormatter.Text("status", 3));
    }

    [Fact]
    public void DateIsDayMonthYear()
    {
        Assert.Equal("01.02.2020", ValueFormatter.Text("date", new DateTime(2020, 2, 1)));
    }

    [Fact]
    public void StringsAndNullsPassThrough()
    {
        Assert.Equal("Завод Юг", ValueFormatter.Text("plant", "Завод Юг"));
        Assert.Equal("срочно", ValueFormatter.Text("labels", "срочно"));
        Assert.Equal("", ValueFormatter.Text("plant", null));
    }
}

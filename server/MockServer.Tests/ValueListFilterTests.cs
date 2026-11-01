using System.Collections;
using DevExtreme.AspNet.Data;
using DevExtreme.AspNet.Data.Helpers;
using MockServer.Api;
using MockServer.Data;

namespace MockServer.Tests;

public class ValueListFilterTests
{
    private static readonly ProductionRecord[] Rows = DataGenerator.Generate(1000, new DateOnly(2026, 10, 31));

    private static DataSourceLoadOptionsBase Parse(string filter)
    {
        var options = new DataSourceLoadOptionsBase { StringToLower = true };
        DataSourceLoadOptionsParser.Parse(options, key => key == "filter" ? filter : null);
        return options;
    }

    /// <summary>Строки по фильтру через перезапись и без неё должны совпадать.</summary>
    private static (int[] Rewritten, int[] Plain, IList? RemainingFilter) Compare(string filter)
    {
        var plain = DataSourceLoader.Load(Rows.AsQueryable(), Parse(filter)).data.Cast<ProductionRecord>().Select(r => r.Id).ToArray();
        var options = Parse(filter);
        var source = ValueListFilter.Apply(Rows.AsQueryable(), options);
        var rewritten = DataSourceLoader.Load(source, options).data.Cast<ProductionRecord>().Select(r => r.Id).ToArray();
        return (rewritten, plain, options.Filter);
    }

    [Fact]
    public void AStringChainBecomesASetAndLeavesNoFilter()
    {
        var codes = Rows.Take(3).Select(r => $"\"{r.MarkingCode}\"");
        var (rewritten, plain, remaining) = Compare($"[[\"markingCode\",\"=\",{codes.ElementAt(0)}],\"or\",[\"markingCode\",\"=\",{codes.ElementAt(1)}],\"or\",[\"markingCode\",\"=\",{codes.ElementAt(2)}]]");

        Assert.Equal(new[] { 1, 2, 3 }, rewritten);
        Assert.Equal(plain, rewritten);
        Assert.Null(remaining);
    }

    [Fact]
    public void TheSetIgnoresCaseLikeStringToLower()
    {
        var code = Rows[0].MarkingCode.ToLowerInvariant();
        var (rewritten, plain, _) = Compare($"[[\"markingCode\",\"=\",\"{code}\"],\"or\",[\"markingCode\",\"=\",\"nope\"]]");

        Assert.Equal(new[] { 1 }, rewritten);
        Assert.Equal(plain, rewritten);
    }

    [Theory]
    [InlineData("[[\"id\",\"=\",5],\"or\",[\"id\",\"=\",7]]", new[] { 5, 7 })]
    [InlineData("[[\"status\",\"=\",0],\"or\",[\"status\",\"=\",3]]", null)]
    [InlineData("[[\"date\",\"=\",\"2020-02-01\"],\"or\",[\"date\",\"=\",\"2020-02-02\"]]", null)]
    public void NumbersAndDatesAreConvertedToThePropertyType(string filter, int[]? expected)
    {
        var (rewritten, plain, remaining) = Compare(filter);

        Assert.NotEmpty(rewritten);
        Assert.Equal(plain, rewritten);
        if (expected is not null) Assert.Equal(expected, rewritten);
        Assert.Null(remaining);
    }

    [Fact]
    public void AChainInsideATopLevelAndIsLiftedAndTheRestOfTheFilterStays()
    {
        var plant = Rows[0].Plant;
        var (rewritten, plain, remaining) = Compare(
            $"[[\"plant\",\"=\",\"{plant}\"],\"and\",[[\"id\",\"=\",1],\"or\",[\"id\",\"=\",2],\"or\",[\"id\",\"=\",999]],\"and\",[\"status\",\">=\",0]]");

        Assert.Equal(plain, rewritten);
        Assert.Contains(1, rewritten);
        Assert.NotNull(remaining);
        Assert.Equal(3, remaining!.Count);
        Assert.Equal("plant", ((IList)remaining[0]!)[0]);
        Assert.Equal("status", ((IList)remaining[2]!)[0]);
    }

    [Fact]
    public void AnAndOfOneChainAndOneConditionLeavesTheCondition()
    {
        var (rewritten, plain, remaining) = Compare("[[[\"id\",\"=\",1],\"or\",[\"id\",\"=\",2]],\"and\",[\"qty\",\">=\",1]]");

        Assert.Equal(new[] { 1, 2 }, rewritten);
        Assert.Equal(plain, rewritten);
        Assert.Equal("qty", remaining![0]);
    }

    [Theory]
    [InlineData("[[\"id\",\"=\",1],\"or\",[\"qty\",\"=\",2]]")]
    [InlineData("[[\"id\",\"=\",1],\"or\",[\"id\",\">\",2]]")]
    [InlineData("[[\"id\",\"=\",1],\"and\",[\"id\",\"=\",2]]")]
    [InlineData("[\"id\",\"=\",1]")]
    [InlineData("[[\"labels\",\"=\",\"a\"],\"or\",[\"labels\",\"=\",\"b\"]]")]
    [InlineData("[[\"id\",\"=\",\"abc\"],\"or\",[\"id\",\"=\",2]]")]
    public void OtherShapesAreLeftToDataSourceLoader(string filter)
    {
        var options = Parse(filter);
        var before = options.Filter;

        var source = ValueListFilter.Apply(Rows.AsQueryable(), options);

        Assert.Same(before, options.Filter);
        Assert.Same(Rows.AsQueryable().Provider.GetType(), source.Provider.GetType());
        Assert.Equal(Rows.Length, source.Count());
    }

    [Theory]
    [InlineData("[\"id\",\"=\",1]", 1)]
    [InlineData("[[\"id\",\"=\",1],\"or\",[\"id\",\"=\",2],\"or\",[\"id\",\"=\",3]]", 3)]
    [InlineData("[[\"a\",\"=\",1],\"and\",[[\"b\",\"=\",1],\"or\",[\"b\",\"=\",2]]]", 3)]
    [InlineData("[\"!\",[[\"a\",\"=\",1],\"or\",[\"b\",\"=\",2]]]", 2)]
    [InlineData("[]", 0)]
    public void OperandsAreCountedAtTheLeaves(string filter, int expected)
    {
        Assert.Equal(expected, ValueListFilter.CountOperands(Parse(filter).Filter));
    }

    [Fact]
    public void NoFilterCountsAsZero()
    {
        Assert.Equal(0, ValueListFilter.CountOperands(null));
    }
}

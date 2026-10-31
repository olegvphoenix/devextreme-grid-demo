using System.Diagnostics;
using MockServer.Data;

namespace MockServer.Tests;

public class DataGeneratorTests
{
    private static readonly DateOnly Today = new(2026, 10, 31);

    [Fact]
    public void SameSeedGivesSameData()
    {
        var a = DataGenerator.Generate(1000, Today);
        var b = DataGenerator.Generate(1000, Today);
        Assert.Equal(a.Select(r => r.MarkingCode), b.Select(r => r.MarkingCode));
    }

    [Fact]
    public void DatesAreBetweenFirstOfFebruary2020AndToday()
    {
        var rows = DataGenerator.Generate(10000, Today);
        Assert.All(rows, r => Assert.InRange(r.Date, new DateTime(2020, 2, 1), new DateTime(2026, 10, 31)));
        Assert.Equal(new DateTime(2020, 2, 1), rows.Min(r => r.Date));
    }

    [Fact]
    public void LastRecordIsDatedTodayAndDatesAreUnspecifiedKind()
    {
        var rows = DataGenerator.Generate(100, Today);
        Assert.Equal(new DateTime(2026, 10, 31), rows[^1].Date);
        Assert.All(rows, r => Assert.Equal(DateTimeKind.Unspecified, r.Date.Kind));
        Assert.All(rows, r => Assert.Equal(TimeSpan.Zero, r.Date.TimeOfDay));
    }

    [Fact]
    public void IdsAreSequentialFromOne()
    {
        var rows = DataGenerator.Generate(500, Today);
        Assert.Equal(Enumerable.Range(1, 500), rows.Select(r => r.Id));
    }

    [Fact]
    public void LineDependsOnPlantAndProductOnLine()
    {
        foreach (var r in DataGenerator.Generate(5000, Today))
        {
            Assert.True(Catalog.PlantLines[r.Plant].ContainsKey(r.Line));
            Assert.Contains(r.Product, Catalog.PlantLines[r.Plant][r.Line]);
        }
    }

    [Fact]
    public void CatalogHasFourPlantsWithTwoToFourLinesAndThreeToFiveProducts()
    {
        Assert.Equal(4, Catalog.PlantLines.Count);
        foreach (var lines in Catalog.PlantLines.Values)
        {
            Assert.InRange(lines.Count, 2, 4);
            Assert.All(lines.Values, products => Assert.InRange(products.Length, 3, 5));
        }
        Assert.Equal(new[] { "Новый", "В работе", "Агрегирован", "Закрыт" }, Catalog.StatusNames);
    }

    [Fact]
    public void WeightsAreRoundedAndGrossExceedsNet()
    {
        foreach (var r in DataGenerator.Generate(5000, Today))
        {
            Assert.Equal(Math.Round(r.NetWeight, 1), r.NetWeight);
            Assert.Equal(Math.Round(r.GrossWeight, 1), r.GrossWeight);
            Assert.True(r.GrossWeight > r.NetWeight);
            Assert.True(r.Qty > 0);
        }
    }

    [Fact]
    public void Ean13HasValidCheckDigit()
    {
        foreach (var r in DataGenerator.Generate(2000, Today))
        {
            Assert.Matches("^\\d{13}$", r.Ean13);
            var sum = r.Ean13.Take(12).Select((c, i) => (c - '0') * (i % 2 == 0 ? 1 : 3)).Sum();
            Assert.Equal((10 - sum % 10) % 10, r.Ean13[12] - '0');
        }
    }

    [Fact]
    public void MarkingCodeIsUniqueAndHasGs1Shape()
    {
        var rows = DataGenerator.Generate(5000, Today);
        Assert.Equal(rows.Length, rows.Select(r => r.MarkingCode).Distinct().Count());
        Assert.All(rows, r => Assert.Matches("^01\\d{14}21[A-Za-z0-9]+$", r.MarkingCode));
    }

    [Fact]
    public void StatusUsesAllFourValues() =>
        Assert.Equal(new[] { 0, 1, 2, 3 },
            DataGenerator.Generate(2000, Today).Select(r => r.Status).Distinct().OrderBy(s => s));

    [Fact]
    public void BatchHasPrefixYearMonthAndNumber()
    {
        foreach (var r in DataGenerator.Generate(2000, Today))
        {
            Assert.Matches("^P-\\d{4}-\\d{4}$", r.Batch);
            Assert.Equal(r.Date.ToString("yyMM"), r.Batch.Substring(2, 4));
        }
    }

    [Fact]
    public void OperatorsAndLabelsComeFromCatalogAndLabelsKeyMirrorsLabels()
    {
        var rows = DataGenerator.Generate(5000, Today);
        Assert.All(rows, r => Assert.Contains(r.Operator, Catalog.Operators));
        Assert.All(rows, r => Assert.All(r.Labels, l => Assert.Contains(l, Catalog.LabelPresets)));
        Assert.All(rows, r => Assert.Equal(
            r.Labels.Length == 0 ? "" : "|" + string.Join("|", r.Labels) + "|", r.LabelsKey));
        Assert.Contains(rows, r => r.Labels.Length > 0);
        Assert.Contains(rows, r => r.Labels.Length == 0);
    }

    [Fact]
    public void CatalogStringsAreSharedBetweenRecords()
    {
        var rows = DataGenerator.Generate(1000, Today);
        var plants = Catalog.PlantLines.Keys.ToArray();
        Assert.All(rows, r => Assert.Contains(plants, p => ReferenceEquals(p, r.Plant)));
        Assert.All(rows, r => Assert.Contains(Catalog.Operators, o => ReferenceEquals(o, r.Operator)));
    }

    [Fact]
    public void MillionRowsGenerateWithinBudget()
    {
        var sw = Stopwatch.StartNew();
        var rows = DataGenerator.Generate(1_000_000, Today);
        sw.Stop();
        Assert.Equal(1_000_000, rows.Length);
        Assert.True(sw.Elapsed < TimeSpan.FromSeconds(15), $"took {sw.Elapsed}");
    }
}

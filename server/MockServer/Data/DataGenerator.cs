using System.Globalization;

namespace MockServer.Data;

public static class DataGenerator
{
    private const string SerialAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
    private static readonly DateTime FirstDate = new(2020, 2, 1);

    private static readonly (string Plant, string Line, string Product, string Ean13)[] Products = BuildProducts();

    public static ProductionRecord[] Generate(int size, DateOnly today, int seed = 20200201)
    {
        if (size <= 0) throw new ArgumentOutOfRangeException(nameof(size));

        var random = new Random(seed);
        var lastDate = today.ToDateTime(TimeOnly.MinValue);
        var daySpan = (int)(lastDate - FirstDate).TotalDays + 1;
        var rows = new ProductionRecord[size];

        for (var i = 0; i < size; i++)
        {
            var id = i + 1;
            var date = i == 0 ? FirstDate
                : i == size - 1 ? lastDate
                : FirstDate.AddDays(random.Next(daySpan));
            var product = Products[random.Next(Products.Length)];
            var netWeight = Math.Round(0.5 + random.NextDouble() * 49.5, 1);
            var grossWeight = Math.Round(netWeight + 0.1 + random.NextDouble() * 4.9, 1);
            var labels = PickLabels(random);

            rows[i] = new ProductionRecord
            {
                Id = id,
                Date = date,
                Plant = product.Plant,
                Line = product.Line,
                Product = product.Product,
                Batch = $"P-{date:yyMM}-{random.Next(1, 10000):0000}",
                NetWeight = netWeight,
                GrossWeight = grossWeight,
                Qty = random.Next(1, 5001),
                MarkingCode = $"010{product.Ean13}21{Serial(random, id)}",
                Ean13 = product.Ean13,
                Status = random.Next(Catalog.StatusNames.Length),
                Operator = Catalog.Operators[random.Next(Catalog.Operators.Length)],
                Labels = labels,
                LabelsKey = ProductionRecord.ToLabelsKey(labels),
            };
        }

        return rows;
    }

    private static string[] PickLabels(Random random)
    {
        var roll = random.Next(100);
        if (roll >= 15) return Array.Empty<string>();
        var first = Catalog.LabelPresets[random.Next(Catalog.LabelPresets.Length)];
        if (roll >= 5) return new[] { first };
        var second = Catalog.LabelPresets[random.Next(Catalog.LabelPresets.Length)];
        return second == first ? new[] { first } : new[] { first, second };
    }

    private static string Serial(Random random, int id)
    {
        Span<char> prefix = stackalloc char[4];
        for (var i = 0; i < prefix.Length; i++)
            prefix[i] = SerialAlphabet[random.Next(SerialAlphabet.Length)];
        return string.Concat(prefix, id.ToString("X", CultureInfo.InvariantCulture));
    }

    private static (string, string, string, string)[] BuildProducts()
    {
        var list = new List<(string, string, string, string)>();
        var index = 0;
        foreach (var (plant, lines) in Catalog.PlantLines)
            foreach (var (line, products) in lines)
                foreach (var product in products)
                    list.Add((plant, line, product, Ean13(++index)));
        return list.ToArray();
    }

    private static string Ean13(int productIndex)
    {
        var body = "460" + productIndex.ToString("000000000", CultureInfo.InvariantCulture);
        var sum = 0;
        for (var i = 0; i < 12; i++)
            sum += (body[i] - '0') * (i % 2 == 0 ? 1 : 3);
        return body + (char)('0' + (10 - sum % 10) % 10);
    }
}

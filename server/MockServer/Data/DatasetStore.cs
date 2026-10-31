using System.Diagnostics;

namespace MockServer.Data;

public sealed record DatasetInfo(int Size, bool Generated, long? GenerationMs);

public sealed class DatasetStore
{
    public static readonly int[] Sizes = { 1000, 100000, 1000000 };

    private readonly Dictionary<int, Lazy<ProductionRecord[]>> _datasets;
    private readonly Dictionary<int, long> _generationMs = new();
    private readonly object _labelsLock = new();

    public DatasetStore(DateOnly today)
    {
        _datasets = Sizes.ToDictionary(
            size => size,
            size => new Lazy<ProductionRecord[]>(() => GenerateTimed(size, today)));
    }

    public ProductionRecord[] Get(int size)
    {
        if (!_datasets.TryGetValue(size, out var dataset))
            throw new ArgumentOutOfRangeException(nameof(size), size, "Unknown dataset size");
        return dataset.Value;
    }

    public DatasetInfo[] Describe() =>
        Sizes.Select(size =>
        {
            var generated = _datasets[size].IsValueCreated;
            long? ms;
            lock (_generationMs) ms = generated && _generationMs.TryGetValue(size, out var v) ? v : null;
            return new DatasetInfo(size, generated, ms);
        }).ToArray();

    public ProductionRecord UpdateLabels(int size, int id, string[] labels)
    {
        var rows = Get(size);
        if (id < 1 || id > rows.Length || rows[id - 1].Id != id)
            throw new KeyNotFoundException($"Record {id} is not in the {size} dataset");
        var record = rows[id - 1];
        lock (_labelsLock)
        {
            record.Labels = labels;
            record.LabelsKey = ProductionRecord.ToLabelsKey(labels);
        }
        return record;
    }

    private ProductionRecord[] GenerateTimed(int size, DateOnly today)
    {
        var sw = Stopwatch.StartNew();
        var rows = DataGenerator.Generate(size, today);
        lock (_generationMs) _generationMs[size] = sw.ElapsedMilliseconds;
        return rows;
    }
}

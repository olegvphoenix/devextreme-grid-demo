using System.Diagnostics;

namespace MockServer.Data;

public sealed record DatasetInfo(int Size, bool Generated, long? GenerationMs);

public sealed class LabelOverlayFullException : Exception
{
    public LabelOverlayFullException(int budget)
        : base($"Ярлыки изменены уже у {budget} записей — больше в этом запуске сервера не принимается; записи с изменёнными ярлыками править можно") { }
}

public sealed class DatasetStore
{
    public static readonly int[] Sizes = { 1000, 100000, 1000000 };

    /// <summary>Строк с изменёнными ярлыками за время работы процесса, по всем наборам.</summary>
    public const int DefaultLabelOverlayBudget = 10_000;

    private readonly Dictionary<int, Lazy<ProductionRecord[]>> _datasets;
    private readonly Dictionary<int, long> _generationMs = new();
    private readonly HashSet<(int Size, int Id)> _labelOverlay = new();
    private readonly int _labelOverlayBudget;

    public DatasetStore(DateOnly today, int labelOverlayBudget = DefaultLabelOverlayBudget)
    {
        _datasets = Sizes.ToDictionary(
            size => size,
            size => new Lazy<ProductionRecord[]>(() => GenerateTimed(size, today)));
        _labelOverlayBudget = labelOverlayBudget;
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

    /// <summary>Записывает ярлыки; новая строка сверх бюджета оверлея — <see cref="LabelOverlayFullException"/>, уже изменённая правится всегда.</summary>
    public ProductionRecord UpdateLabels(int size, int id, string[] labels)
    {
        var rows = Get(size);
        if (id < 1 || id > rows.Length || rows[id - 1].Id != id)
            throw new KeyNotFoundException($"Record {id} is not in the {size} dataset");
        lock (_labelOverlay)
        {
            if (!_labelOverlay.Contains((size, id)))
            {
                if (_labelOverlay.Count >= _labelOverlayBudget)
                    throw new LabelOverlayFullException(_labelOverlayBudget);
                _labelOverlay.Add((size, id));
            }
        }
        var record = rows[id - 1];
        record.Labels = labels;
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

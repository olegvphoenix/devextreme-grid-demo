using System.Text.Json.Serialization;

namespace MockServer.Data;

public sealed class LabelSet
{
    public static readonly LabelSet Empty = new(Array.Empty<string>(), "");

    private LabelSet(string[] values, string key)
    {
        Values = values;
        Key = key;
    }

    public string[] Values { get; }
    public string Key { get; }

    public static LabelSet From(string[] labels) =>
        labels.Length == 0 ? Empty : new LabelSet(labels, ProductionRecord.ToLabelsKey(labels));
}

public sealed class ProductionRecord
{
    private LabelSet _labels = LabelSet.Empty;

    public int Id { get; set; }
    public DateTime Date { get; set; }
    public string Plant { get; set; } = "";
    public string Line { get; set; } = "";
    public string Product { get; set; } = "";
    public string Batch { get; set; } = "";
    public double NetWeight { get; set; }
    public double GrossWeight { get; set; }
    public int Qty { get; set; }
    public string MarkingCode { get; set; } = "";
    public string Ean13 { get; set; } = "";
    public int Status { get; set; }
    public string Operator { get; set; } = "";

    public string[] Labels
    {
        get => _labels.Values;
        set => _labels = LabelSet.From(value);
    }

    public string LabelsKey => _labels.Key;

    [JsonIgnore]
    public LabelSet LabelSet => _labels;

    public static string ToLabelsKey(string[] labels) =>
        labels.Length == 0 ? "" : "|" + string.Join("|", labels) + "|";
}

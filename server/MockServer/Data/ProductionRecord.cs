namespace MockServer.Data;

public sealed class ProductionRecord
{
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
    public string[] Labels { get; set; } = Array.Empty<string>();
    public string LabelsKey { get; set; } = "";

    public static string ToLabelsKey(string[] labels) =>
        labels.Length == 0 ? "" : "|" + string.Join("|", labels) + "|";
}

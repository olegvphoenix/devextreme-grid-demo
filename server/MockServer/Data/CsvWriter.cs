using System.Globalization;

namespace MockServer.Data;

public static class CsvWriter
{
    public static void Write(IEnumerable<ProductionRecord> rows, TextWriter writer)
    {
        writer.WriteLine("id,date,plant,line,product,batch,netWeight,grossWeight,qty,markingCode,ean13,status,operator,labels");
        var inv = CultureInfo.InvariantCulture;
        foreach (var r in rows)
        {
            writer.Write(r.Id.ToString(inv));
            writer.Write(',');
            writer.Write(r.Date.ToString("yyyy-MM-dd", inv));
            writer.Write(',');
            writer.Write(Quote(r.Plant));
            writer.Write(',');
            writer.Write(Quote(r.Line));
            writer.Write(',');
            writer.Write(Quote(r.Product));
            writer.Write(',');
            writer.Write(r.Batch);
            writer.Write(',');
            writer.Write(r.NetWeight.ToString("0.0", inv));
            writer.Write(',');
            writer.Write(r.GrossWeight.ToString("0.0", inv));
            writer.Write(',');
            writer.Write(r.Qty.ToString(inv));
            writer.Write(',');
            writer.Write(r.MarkingCode);
            writer.Write(',');
            writer.Write(r.Ean13);
            writer.Write(',');
            writer.Write(r.Status.ToString(inv));
            writer.Write(',');
            writer.Write(Quote(r.Operator));
            writer.Write(',');
            writer.WriteLine(Quote(string.Join(";", r.Labels)));
        }
    }

    private static string Quote(string value) =>
        value.IndexOfAny(new[] { ',', '"', '\r', '\n' }) < 0 ? value : "\"" + value.Replace("\"", "\"\"") + "\"";
}

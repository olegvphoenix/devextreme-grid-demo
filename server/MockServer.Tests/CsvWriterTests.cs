using MockServer.Data;

namespace MockServer.Tests;

public class CsvWriterTests
{
    [Fact]
    public void WritesHeaderAndOneLinePerRow()
    {
        var rows = DataGenerator.Generate(25, new DateOnly(2026, 10, 31));
        using var writer = new StringWriter();

        CsvWriter.Write(rows, writer);

        var lines = writer.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(26, lines.Length);
        Assert.Equal("id,date,plant,line,product,batch,netWeight,grossWeight,qty,markingCode,ean13,status,operator,labels", lines[0].TrimEnd('\r'));
        Assert.StartsWith("1,2020-02-01,", lines[1]);
        Assert.All(lines, l => Assert.Equal(13, CountSeparators(l)));
    }

    private static int CountSeparators(string line)
    {
        var count = 0;
        var quoted = false;
        foreach (var c in line)
        {
            if (c == '"') quoted = !quoted;
            else if (c == ',' && !quoted) count++;
        }
        return count;
    }
}

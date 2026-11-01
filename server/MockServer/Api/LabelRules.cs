namespace MockServer.Api;

/// <summary>
/// Ярлыки пишет любой посетитель открытого демо: ограничены числом и длиной (как
/// <c>maxlength</c> поля ввода), без управляющих символов и без первого символа формулы
/// Excel, чтобы вставка TSV у другого посетителя ничего не вычисляла.
/// </summary>
public static class LabelRules
{
    public const int MaxCount = 10;
    public const int MaxLength = 32;
    private const string FormulaStarts = "=+-@";
    private const char Separator = '|';

    public static void Validate(string[]? labels)
    {
        if (labels is null)
            throw new BadHttpRequestException("Поле labels обязательно: массив строк");
        if (labels.Length > MaxCount)
            throw new BadHttpRequestException($"У записи не больше {MaxCount} ярлыков");
        foreach (var label in labels)
        {
            if (string.IsNullOrWhiteSpace(label))
                throw new BadHttpRequestException("Ярлык не может быть пустым");
            if (label.Length > MaxLength)
                throw new BadHttpRequestException($"Ярлык не длиннее {MaxLength} символов");
            if (label.Contains(Separator))
                throw new BadHttpRequestException($"Ярлык не может содержать символ {Separator}");
            if (label.Any(char.IsControl))
                throw new BadHttpRequestException("Ярлык не может содержать управляющие символы");
            if (FormulaStarts.Contains(label[0]))
                throw new BadHttpRequestException($"Ярлык не может начинаться с символов {string.Join(' ', FormulaStarts.ToCharArray())}");
        }
    }
}

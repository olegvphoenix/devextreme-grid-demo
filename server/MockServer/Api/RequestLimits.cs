namespace MockServer.Api;

/// <summary>
/// Самое большое тело клиента — три усечённых списка по 5 000 значений (партия, код маркировки,
/// идентификатор) через «Выбрать показанные»: около 975 КБ в кодировке формы, один список — около
/// 425 КБ (docs/measurements.md). Пределы с запасом.
/// </summary>
public static class RequestLimits
{
    public const int FormValueBytes = 2 * 1024 * 1024;
    public const long BodyBytes = 4 * 1024 * 1024;
    /// <summary>ReadFormAsync бросает InvalidDataException и на повреждённую форму, и на значение сверх предела.</summary>
    public const string BadFormMessage = "Некорректный запрос: форма повреждена или значение длиннее 2 МБ";
}

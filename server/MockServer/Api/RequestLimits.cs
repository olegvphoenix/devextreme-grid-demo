namespace MockServer.Api;

/// <summary>
/// Самое большое тело клиента — фильтр из 5 000 кодов маркировки через «Выбрать показанные»:
/// около 430 КБ в кодировке формы (docs/measurements.md). Пределы с запасом в несколько раз.
/// </summary>
public static class RequestLimits
{
    public const int FormValueBytes = 2 * 1024 * 1024;
    public const long BodyBytes = 4 * 1024 * 1024;
    public const string TooLargeMessage = "Тело запроса больше допустимого: не более 2 МБ на значение формы";
}

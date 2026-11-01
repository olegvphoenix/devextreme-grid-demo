using System.Threading.RateLimiting;

namespace MockServer.Api;

/// <summary>
/// Общий на процесс предел одновременных запросов к <c>/api/distinct</c> и <c>/api/stats</c>:
/// каждый — проход по набору, окно фильтра открывает их по одному-два. Экземпляр один, чтобы
/// тесты брали разрешения у него напрямую, как слоты тяжёлых запросов.
/// </summary>
public sealed class ColumnRequestLimiter
{
    public const int ConcurrentRequests = 8;
    public const int QueuedRequests = 32;

    public RateLimiter Limiter { get; } = new ConcurrencyLimiter(new ConcurrencyLimiterOptions
    {
        PermitLimit = ConcurrentRequests,
        QueueLimit = QueuedRequests,
        QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
    });
}

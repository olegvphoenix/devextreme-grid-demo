using DevExtreme.AspNet.Data;

namespace MockServer.Api;

public sealed class HeavyRequestLimiter
{
    public const string BusyMessage = "Сервер занят: одновременно выполняется не более двух тяжёлых запросов, повторите позже";
    /// <summary>Самый большой размер страницы грида; запрос за большим числом строк — тяжёлый.</summary>
    public const int MaxPageSize = 500;

    private readonly SemaphoreSlim _slots;

    public HeavyRequestLimiter(int maxConcurrent) => _slots = new SemaphoreSlim(maxConcurrent, maxConcurrent);

    /// <summary>Без страницы, страница больше грида или раскрытая группа: ответ — весь набор под фильтром.</summary>
    public static bool IsHeavy(DataSourceLoadOptionsBase options) =>
        options.Take <= 0
        || options.Take > MaxPageSize
        || options.Group is { } groups && groups.Any(g => g.IsExpanded == true);

    public bool TryEnter(out IDisposable lease)
    {
        if (_slots.Wait(0))
        {
            lease = new Lease(_slots);
            return true;
        }

        lease = Lease.None;
        return false;
    }

    private sealed class Lease : IDisposable
    {
        public static readonly Lease None = new(null);

        private SemaphoreSlim? _slots;

        public Lease(SemaphoreSlim? slots) => _slots = slots;

        public void Dispose() => Interlocked.Exchange(ref _slots, null)?.Release();
    }
}

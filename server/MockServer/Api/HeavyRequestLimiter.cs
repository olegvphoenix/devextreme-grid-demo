namespace MockServer.Api;

public sealed class HeavyRequestLimiter
{
    public const string BusyMessage = "Сервер занят: одновременно выполняется не более двух тяжёлых запросов, повторите позже";

    private readonly SemaphoreSlim _slots;

    public HeavyRequestLimiter(int maxConcurrent) => _slots = new SemaphoreSlim(maxConcurrent, maxConcurrent);

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

import { GridMetricsService } from './grid-metrics.service';

type FrameCallback = (time: number) => void;

describe('GridMetricsService', () => {
  let service: GridMetricsService;
  let now: number;

  function latest<T>(source: { subscribe: (fn: (v: T) => void) => unknown }) {
    const box: { value: T | undefined } = { value: undefined };
    source.subscribe((v) => (box.value = v));
    return box;
  }

  beforeEach(() => {
    now = 0;
    spyOn(performance, 'now').and.callFake(() => now);
    service = new GridMetricsService();
  });

  describe('время до onContentReady', () => {
    it('sort измеряется только между markStart и markContentReady', () => {
      const sort = latest(service.sortMs$);
      now = 50;
      service.markContentReady();
      expect(sort.value).toBeNull();

      now = 100;
      service.markStart('sort');
      now = 350;
      service.markContentReady();
      expect(sort.value).toBe(250);

      now = 900;
      service.markContentReady();
      expect(sort.value).toBe(250);
    });

    it('два markStart подряд берут последний', () => {
      const sort = latest(service.sortMs$);
      const firstRender = latest(service.firstRenderMs$);
      now = 0;
      service.markStart('sort');
      now = 100;
      service.markStart('first-render');
      now = 160;
      service.markContentReady();
      expect(firstRender.value).toBe(60);
      expect(sort.value).toBeNull();
    });

    it('filter попадает в filterMs$', () => {
      const filter = latest(service.filterMs$);
      service.markStart('filter');
      now = 42;
      service.markContentReady();
      expect(filter.value).toBe(42);
    });
  });

  describe('FPS при прокрутке', () => {
    let frames: FrameCallback[];
    let cancelled: number[];
    let element: HTMLElement;

    function runFrames(count: number, stepMs: number): void {
      for (let i = 0; i < count; i++) {
        now += stepMs;
        const callback = frames.shift();
        if (callback === undefined) {
          throw new Error('нет запрошенного кадра');
        }
        callback(now);
      }
    }

    beforeEach(() => {
      frames = [];
      cancelled = [];
      let nextId = 1;
      spyOn(window, 'requestAnimationFrame').and.callFake(
        (callback: FrameCallback) => {
          frames.push(callback);
          return nextId++;
        }
      );
      spyOn(window, 'cancelAnimationFrame').and.callFake((id: number) =>
        cancelled.push(id)
      );
      element = document.createElement('div');
    });

    it('без прокрутки цикл не запускается', () => {
      service.startFpsWhileScrolling(element);
      expect(frames.length).toBe(0);
      expect(window.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('FPS считается за секунду', () => {
      const fps = latest(service.fps$);
      const minFps = latest(service.minFps$);
      service.startFpsWhileScrolling(element);
      element.dispatchEvent(new Event('scroll'));
      expect(frames.length).toBe(1);

      for (let i = 0; i < 49; i++) {
        runFrames(1, 20);
        element.dispatchEvent(new Event('scroll'));
      }
      expect(fps.value).toBeNull();
      runFrames(1, 20);
      expect(fps.value).toBe(50);
      expect(minFps.value).toBe(50);

      for (let i = 0; i < 25; i++) {
        element.dispatchEvent(new Event('scroll'));
        runFrames(1, 40);
      }
      expect(fps.value).toBe(25);
      expect(minFps.value).toBe(25);
    });

    it('цикл останавливается, когда прокрутка прекратилась', () => {
      service.startFpsWhileScrolling(element);
      element.dispatchEvent(new Event('scroll'));
      runFrames(5, 16);
      expect(frames.length).toBe(1);
      runFrames(1, 400);
      expect(frames.length).toBe(0);

      element.dispatchEvent(new Event('scroll'));
      expect(frames.length).toBe(1);
    });

    it('короткая прокрутка даёт FPS по неполному окну', () => {
      const fps = latest(service.fps$);
      service.startFpsWhileScrolling(element);
      element.dispatchEvent(new Event('scroll'));
      for (let i = 0; i < 20; i++) {
        runFrames(1, 20);
        element.dispatchEvent(new Event('scroll'));
      }
      expect(fps.value).toBeNull();
      runFrames(1, 310);
      expect(fps.value).toBe(30);
      expect(frames.length).toBe(0);
    });

    it('прокрутка вложенного контейнера тоже запускает цикл', () => {
      const inner = document.createElement('div');
      element.appendChild(inner);
      service.startFpsWhileScrolling(element);
      inner.dispatchEvent(new Event('scroll'));
      expect(frames.length).toBe(1);
    });

    it('остановка снимает обработчик и отменяет кадр', () => {
      const stop = service.startFpsWhileScrolling(element);
      element.dispatchEvent(new Event('scroll'));
      stop();
      expect(cancelled).toEqual([1]);
      element.dispatchEvent(new Event('scroll'));
      expect(frames.length).toBe(1);
    });
  });
});

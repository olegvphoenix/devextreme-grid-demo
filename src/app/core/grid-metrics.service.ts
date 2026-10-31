import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type MetricKind = 'first-render' | 'sort' | 'filter';

/** Прокрутка считается законченной, если событий не было столько мс. */
const SCROLL_IDLE_MS = 300;
const FPS_WINDOW_MS = 1000;
/** Неполное окно короче этого при остановке не даёт числа. */
const MIN_PARTIAL_WINDOW_MS = 500;

/**
 * Метрики страницы грида: время от действия до `onContentReady` и FPS при
 * прокрутке через `performance.now()` и `requestAnimationFrame`.
 */
@Injectable({ providedIn: 'root' })
export class GridMetricsService {
  private readonly firstRenderMs = new BehaviorSubject<number | null>(null);
  private readonly sortMs = new BehaviorSubject<number | null>(null);
  private readonly filterMs = new BehaviorSubject<number | null>(null);
  private readonly fps = new BehaviorSubject<number | null>(null);
  private readonly minFps = new BehaviorSubject<number | null>(null);

  private pending: MetricKind | null = null;
  private startedAt = 0;

  readonly firstRenderMs$: Observable<number | null> =
    this.firstRenderMs.asObservable();
  readonly sortMs$: Observable<number | null> = this.sortMs.asObservable();
  readonly filterMs$: Observable<number | null> = this.filterMs.asObservable();
  readonly fps$: Observable<number | null> = this.fps.asObservable();
  readonly minFps$: Observable<number | null> = this.minFps.asObservable();

  markStart(kind: MetricKind): void {
    this.pending = kind;
    this.startedAt = performance.now();
  }

  markContentReady(): void {
    if (this.pending === null) {
      return;
    }
    const elapsed = Math.round(performance.now() - this.startedAt);
    this.subjectOf(this.pending).next(elapsed);
    this.pending = null;
  }

  /** Загрузка не удалась: следующий onContentReady не относится к начатому замеру. */
  cancelPending(): void {
    this.pending = null;
  }

  /**
   * Цикл кадров идёт только пока приходят события прокрутки; возвращает
   * остановку. `scroll` не всплывает, поэтому слушатель перехватывающий:
   * считается прокрутка и самого элемента, и вложенного контейнера.
   */
  startFpsWhileScrolling(scrollable: HTMLElement): () => void {
    let frameId: number | null = null;
    let frames = 0;
    let windowStart = 0;
    let lastScrollAt = 0;

    const tick = (): void => {
      const now = performance.now();
      frames++;
      const elapsed = now - windowStart;
      if (elapsed >= FPS_WINDOW_MS) {
        this.reportFps(frames, elapsed);
        frames = 0;
        windowStart = now;
      }
      if (now - lastScrollAt > SCROLL_IDLE_MS) {
        if (elapsed >= MIN_PARTIAL_WINDOW_MS && frames > 0) {
          this.reportFps(frames, elapsed);
        }
        frameId = null;
        return;
      }
      frameId = requestAnimationFrame(tick);
    };

    const onScroll = (): void => {
      lastScrollAt = performance.now();
      if (frameId === null) {
        frames = 0;
        windowStart = lastScrollAt;
        frameId = requestAnimationFrame(tick);
      }
    };

    const listenerOptions = { passive: true, capture: true };
    scrollable.addEventListener('scroll', onScroll, listenerOptions);
    return () => {
      scrollable.removeEventListener('scroll', onScroll, listenerOptions);
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
        frameId = null;
      }
    };
  }

  private reportFps(frames: number, elapsedMs: number): void {
    const fps = Math.round((frames * 1000) / elapsedMs);
    this.fps.next(fps);
    const min = this.minFps.value;
    this.minFps.next(min === null ? fps : Math.min(min, fps));
  }

  private subjectOf(kind: MetricKind): BehaviorSubject<number | null> {
    switch (kind) {
      case 'first-render':
        return this.firstRenderMs;
      case 'sort':
        return this.sortMs;
      case 'filter':
        return this.filterMs;
    }
  }
}

import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  BehaviorSubject,
  defer,
  from,
  Observable,
  Subject,
  Subscription,
  throwError,
} from 'rxjs';
import { catchError, mergeMap, tap } from 'rxjs/operators';

import { FilterExpression } from '../models/column-filter.model';
import { DatasetSize } from '../models/dataset.model';
import { ColumnStats, DistinctResult } from '../models/distinct.model';
import {
  ExportRequest,
  GridLoadOptions,
  GridLoadResult,
} from '../models/load-options.model';
import { ProductionRecord } from '../models/production-record.model';
import { ApiError } from './api-error';

type RequestGroup = 'rows' | 'distinct' | 'stats';

type FormValue = string | number | boolean | object | null | undefined;

const FORM_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
};

@Injectable({ providedIn: 'root' })
export class DataService {
  dataset: DatasetSize = 1000;

  private readonly responseMs = new Subject<number>();
  private readonly cancelled = new BehaviorSubject<number>(0);
  private readonly active: Record<RequestGroup, Subscription | null> = {
    rows: null,
    distinct: null,
    stats: null,
  };

  readonly responseMs$: Observable<number> = this.responseMs.asObservable();
  /** Накопительный счётчик запросов, отменённых новым запросом своей группы. */
  readonly cancelled$: Observable<number> = this.cancelled.asObservable();

  constructor(private readonly http: HttpClient) {}

  query(options: GridLoadOptions): Observable<GridLoadResult> {
    const request$ = this.postForm<GridLoadResult>('/api/rows/query', {
      skip: options.skip,
      take: options.take,
      requireTotalCount: options.requireTotalCount,
      requireGroupCount: options.requireGroupCount,
      sort: options.sort,
      group: options.group,
      filter: options.filter,
      totalSummary: options.totalSummary,
      groupSummary: options.groupSummary,
    });
    return this.inGroup(
      'rows',
      defer(() => {
        const started = performance.now();
        return request$.pipe(
          tap(() => this.responseMs.next(elapsedMs(started)))
        );
      })
    );
  }

  distinct(
    field: string,
    filter: FilterExpression | null,
    search?: string
  ): Observable<DistinctResult> {
    return this.inGroup(
      'distinct',
      this.postForm<DistinctResult>('/api/distinct', { field, filter, search })
    );
  }

  stats(
    field: string,
    filter: FilterExpression | null
  ): Observable<ColumnStats> {
    return this.inGroup(
      'stats',
      this.postForm<ColumnStats>('/api/stats', { field, filter })
    );
  }

  updateLabels(id: number, labels: string[]): Observable<ProductionRecord> {
    return this.http
      .put<ProductionRecord>(
        `/api/rows/${id}/labels`,
        { labels },
        { params: { dataset: String(this.dataset) } }
      )
      .pipe(catchError((e: HttpErrorResponse) => this.toApiError(e)));
  }

  exportFile(kind: 'xlsx' | 'pdf', request: ExportRequest): Observable<Blob> {
    return this.http
      .post(
        `/api/export/${kind}`,
        this.encodeForm({
          columns: request.columns,
          sort: request.sort,
          group: request.group,
          filter: request.filter,
        }),
        { headers: FORM_HEADERS, responseType: 'blob' }
      )
      .pipe(catchError((e: HttpErrorResponse) => this.toApiError(e)));
  }

  private postForm<T>(
    url: string,
    fields: Record<string, FormValue>
  ): Observable<T> {
    return this.http
      .post<T>(url, this.encodeForm(fields), { headers: FORM_HEADERS })
      .pipe(catchError((e: HttpErrorResponse) => this.toApiError(e)));
  }

  private encodeForm(fields: Record<string, FormValue>): string {
    const body = new URLSearchParams();
    body.set('dataset', String(this.dataset));
    Object.entries(fields).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      body.set(
        key,
        typeof value === 'object' ? JSON.stringify(value) : String(value)
      );
    });
    return body.toString();
  }

  /** Подписка запускает запрос и отменяет незавершённый запрос своей группы. */
  private inGroup<T>(
    group: RequestGroup,
    request$: Observable<T>
  ): Observable<T> {
    return new Observable<T>((subscriber) => {
      const previous = this.active[group];
      if (previous !== null && !previous.closed) {
        previous.unsubscribe();
        this.cancelled.next(this.cancelled.value + 1);
      }
      const subscription = request$.subscribe(subscriber);
      this.active[group] = subscription;
      subscription.add(() => {
        if (this.active[group] === subscription) {
          this.active[group] = null;
        }
      });
      return subscription;
    });
  }

  private toApiError(response: HttpErrorResponse): Observable<never> {
    const fallback = `Ошибка ${response.status}: ${response.statusText}`;
    if (response.error instanceof Blob) {
      return from(response.error.text()).pipe(
        mergeMap((text) => {
          const message = readMessage(parseJson(text), fallback);
          return throwError(new ApiError(response.status, message));
        })
      );
    }
    return throwError(
      new ApiError(response.status, readMessage(response.error, fallback))
    );
  }
}

function elapsedMs(started: number): number {
  return Math.round(performance.now() - started);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  return fallback;
}

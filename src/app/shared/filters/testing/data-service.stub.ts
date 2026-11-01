import { Observable, Subject, Subscription } from 'rxjs';

import { FilterExpression } from '../../../models/column-filter.model';
import { ColumnStats, DistinctResult } from '../../../models/distinct.model';
import {
  GridLoadOptions,
  GridLoadResult,
} from '../../../models/load-options.model';
import { ProductionRecord } from '../../../models/production-record.model';
import { ApiError } from '../../../core/api-error';

export interface LabelsCall {
  id: number;
  labels: string[];
}

export interface DistinctCall {
  field: string;
  filter: FilterExpression | null;
  search: string | undefined;
}

export interface StatsCall {
  field: string;
  filter: FilterExpression | null;
}

/** Заглушка `DataService`: каждый вызов — свой Subject, ответ выдаётся тестом. */
export class DataServiceStub {
  readonly queryCalls: GridLoadOptions[] = [];
  readonly distinctCalls: DistinctCall[] = [];
  readonly statsCalls: StatsCall[] = [];
  readonly labelsCalls: LabelsCall[] = [];
  /** Сколько прежних запросов stats ещё были подписаны в момент каждого вызова. */
  readonly statsPendingAtCall: number[] = [];

  private readonly querySubjects: Subject<GridLoadResult>[] = [];
  private readonly distinctSubjects: Subject<DistinctResult>[] = [];
  private readonly statsSubjects: Subject<ColumnStats>[] = [];
  private readonly labelsSubjects: Subject<ProductionRecord>[] = [];
  private activeQuery: Subscription | null = null;

  /** Как `inGroup` в DataService: новый запрос отписывает потребителя прежнего. */
  query(options: GridLoadOptions): Observable<GridLoadResult> {
    this.queryCalls.push(options);
    const subject = new Subject<GridLoadResult>();
    this.querySubjects.push(subject);
    return new Observable<GridLoadResult>((subscriber) => {
      this.activeQuery?.unsubscribe();
      const subscription = subject.subscribe(subscriber);
      this.activeQuery = subscription;
      return subscription;
    });
  }

  get lastQuery(): GridLoadOptions {
    return this.queryCalls[this.queryCalls.length - 1];
  }

  respondQuery(
    result: GridLoadResult,
    index: number = this.querySubjects.length - 1
  ): void {
    this.querySubjects[index].next(result);
    this.querySubjects[index].complete();
  }

  failQuery(message: string): void {
    const subject = this.querySubjects[this.querySubjects.length - 1];
    subject.error(new ApiError(500, message));
  }

  distinct(
    field: string,
    filter: FilterExpression | null,
    search?: string
  ): Observable<DistinctResult> {
    this.distinctCalls.push({ field, filter, search });
    const subject = new Subject<DistinctResult>();
    this.distinctSubjects.push(subject);
    return subject.asObservable();
  }

  stats(field: string, filter: FilterExpression | null): Observable<ColumnStats> {
    this.statsCalls.push({ field, filter });
    this.statsPendingAtCall.push(
      this.statsSubjects.filter((s) => s.observers.length > 0).length
    );
    const subject = new Subject<ColumnStats>();
    this.statsSubjects.push(subject);
    return subject.asObservable();
  }

  get lastDistinct(): DistinctCall {
    return this.distinctCalls[this.distinctCalls.length - 1];
  }

  get lastStats(): StatsCall {
    return this.statsCalls[this.statsCalls.length - 1];
  }

  respondDistinct(
    result: DistinctResult,
    index: number = this.distinctSubjects.length - 1
  ): void {
    this.distinctSubjects[index].next(result);
    this.distinctSubjects[index].complete();
  }

  failDistinct(message: string): void {
    const subject = this.distinctSubjects[this.distinctSubjects.length - 1];
    subject.error(new ApiError(500, message));
  }

  respondStats(stats: ColumnStats): void {
    const subject = this.statsSubjects[this.statsSubjects.length - 1];
    subject.next(stats);
    subject.complete();
  }

  isStatsPending(index: number): boolean {
    return this.statsSubjects[index].observers.length > 0;
  }

  failStats(message: string): void {
    const subject = this.statsSubjects[this.statsSubjects.length - 1];
    subject.error(new ApiError(500, message));
  }

  updateLabels(id: number, labels: string[]): Observable<ProductionRecord> {
    this.labelsCalls.push({ id, labels });
    const subject = new Subject<ProductionRecord>();
    this.labelsSubjects.push(subject);
    return subject.asObservable();
  }

  respondLabels(record: ProductionRecord): void {
    const subject = this.labelsSubjects[this.labelsSubjects.length - 1];
    subject.next(record);
    subject.complete();
  }

  failLabels(status: number, message: string): void {
    const subject = this.labelsSubjects[this.labelsSubjects.length - 1];
    subject.error(new ApiError(status, message));
  }
}

export function items(
  ...pairs: Array<[number | string, string]>
): DistinctResult {
  return {
    items: pairs.map(([value, text]) => ({ value, text, count: 1 })),
    totalCount: pairs.length,
    truncated: false,
  };
}

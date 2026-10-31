import { Observable, Subject } from 'rxjs';

import { FilterExpression } from '../../../models/column-filter.model';
import { ColumnStats, DistinctResult } from '../../../models/distinct.model';
import { ApiError } from '../../../core/api-error';

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
  readonly distinctCalls: DistinctCall[] = [];
  readonly statsCalls: StatsCall[] = [];
  /** Сколько прежних запросов stats ещё были подписаны в момент каждого вызова. */
  readonly statsPendingAtCall: number[] = [];

  private readonly distinctSubjects: Subject<DistinctResult>[] = [];
  private readonly statsSubjects: Subject<ColumnStats>[] = [];

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

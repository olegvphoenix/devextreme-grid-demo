import { LoadResultObject } from 'devextreme/common/data/custom-store';
import { LoadOptions } from 'devextreme/data';
import CustomStore from 'devextreme/data/custom_store';

import { ApiError } from '../../core/api-error';
import { DataService } from '../../core/data.service';
import { FilterExpression } from '../../models/column-filter.model';
import {
  GridLoadOptions,
  GridLoadResult,
  GroupItem,
  SortItem,
  SummaryItem,
} from '../../models/load-options.model';
import { ProductionRecord } from '../../models/production-record.model';

type RowLoadOptions = LoadOptions<ProductionRecord>;
type RowLoadResult = LoadResultObject<ProductionRecord>;

/** Ответ запроса, который DataService отменил ради нового: грид его уже не ждёт. */
function supersededResult(): RowLoadResult {
  return { data: [] };
}

/**
 * `CustomStore` над `DataService.query`. Запрос, отменённый новым запросом,
 * не завершается в DataService, поэтому promise закрывается по отписке
 * потребителя — без `onError` и без отказа.
 */
export function createGridStore(
  data: DataService,
  onError: (e: ApiError) => void
): CustomStore<ProductionRecord, number> {
  return new CustomStore<ProductionRecord, number>({
    key: 'id',
    load: (options: RowLoadOptions) => loadRows(data, options, onError),
  });
}

function loadRows(
  data: DataService,
  options: RowLoadOptions,
  onError: (e: ApiError) => void
): Promise<RowLoadResult> {
  return new Promise<RowLoadResult>((resolve, reject) => {
    let settled = false;
    const subscription = data.query(toGridLoadOptions(options)).subscribe({
      next: (result) => {
        settled = true;
        resolve(toLoadResult(result));
      },
      error: (e: ApiError) => {
        settled = true;
        onError(e);
        reject(e);
      },
    });
    subscription.add(() => {
      if (!settled) {
        settled = true;
        resolve(supersededResult());
      }
    });
  });
}

function toLoadResult(result: GridLoadResult): RowLoadResult {
  const loadResult: RowLoadResult = { data: result.data };
  if (result.totalCount !== undefined) {
    loadResult.totalCount = result.totalCount;
  }
  if (result.groupCount !== undefined) {
    loadResult.groupCount = result.groupCount;
  }
  if (result.summary !== null && result.summary !== undefined) {
    loadResult.summary = result.summary;
  }
  return loadResult;
}

function toGridLoadOptions(options: RowLoadOptions): GridLoadOptions {
  const result: GridLoadOptions = {};
  if (options.skip !== undefined) {
    result.skip = options.skip;
  }
  if (options.take !== undefined) {
    result.take = options.take;
  }
  if (options.requireTotalCount !== undefined) {
    result.requireTotalCount = options.requireTotalCount;
  }
  if (options.requireGroupCount !== undefined) {
    result.requireGroupCount = options.requireGroupCount;
  }
  const sort = normalizeDescriptors(options.sort);
  if (sort.length > 0) {
    result.sort = sort;
  }
  const group = normalizeDescriptors(options.group);
  if (group.length > 0) {
    result.group = group;
  }
  if (options.filter !== undefined && options.filter !== null) {
    result.filter = options.filter as FilterExpression;
  }
  const totalSummary = normalizeSummary(options.totalSummary);
  if (totalSummary.length > 0) {
    result.totalSummary = totalSummary;
  }
  const groupSummary = normalizeSummary(options.groupSummary);
  if (groupSummary.length > 0) {
    result.groupSummary = groupSummary;
  }
  return result;
}

/** Селектор строкой или объектом; функции сериализовать нельзя, они отбрасываются. */
function normalizeDescriptors(descriptor: unknown): GroupItem[] {
  const result: GroupItem[] = [];
  asArray(descriptor).forEach((item) => {
    if (typeof item === 'string') {
      result.push({ selector: item });
    } else if (isSelectorObject(item)) {
      const normalized: GroupItem = { selector: item.selector };
      if (typeof item.desc === 'boolean') {
        normalized.desc = item.desc;
      }
      if (typeof item.isExpanded === 'boolean') {
        normalized.isExpanded = item.isExpanded;
      }
      result.push(normalized);
    }
  });
  return result;
}

function normalizeSummary(descriptor: unknown): SummaryItem[] {
  const result: SummaryItem[] = [];
  asArray(descriptor).forEach((item) => {
    if (isSummaryObject(item)) {
      const normalized: SummaryItem = { summaryType: item.summaryType };
      if (typeof item.selector === 'string') {
        normalized.selector = item.selector;
      }
      result.push(normalized);
    }
  });
  return result;
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function isSelectorObject(
  value: unknown
): value is SortItem & { isExpanded?: unknown; desc?: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { selector?: unknown }).selector === 'string'
  );
}

function isSummaryObject(value: unknown): value is SummaryItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { summaryType?: unknown }).summaryType === 'string'
  );
}

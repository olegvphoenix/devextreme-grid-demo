import {
  FilterValue,
  GridFilterState,
} from '../../models/column-filter.model';
import { DistinctItem, DistinctResult } from '../../models/distinct.model';
import {
  buildColumnExpression,
  isColumnFilterActive,
} from './filter-expression';

/**
 * Список значений колонки с множественным выбором, зависящий от фильтров
 * других колонок. Ответ сервера принимается только на последний выданный
 * requestId. При полном списке выбранные значения, которых больше нет,
 * отбрасываются; при усечённом — сохраняются, потому что могли не поместиться.
 */
export class DependentListModel {
  private currentItems: DistinctItem[] = [];
  private currentTruncated = false;
  private currentTotalCount = 0;
  private readonly selected: Set<FilterValue>;
  private lastRequestId = 0;

  constructor(selected: FilterValue[] = []) {
    this.selected = new Set(selected);
  }

  get items(): DistinctItem[] {
    return this.currentItems;
  }

  get truncated(): boolean {
    return this.currentTruncated;
  }

  get totalCount(): number {
    return this.currentTotalCount;
  }

  get allSelected(): boolean {
    return (
      this.currentItems.length > 0 &&
      this.currentItems.every((item) => this.selected.has(item.value))
    );
  }

  /** При усечённом списке «выбрать всё» задаёт явные показанные значения, а не «нет фильтра». */
  get selectAllLabel(): string {
    return this.currentTruncated
      ? `Выбрать показанные (${this.currentItems.length})`
      : 'Выбрать всё';
  }

  nextRequestId(): number {
    this.lastRequestId += 1;
    return this.lastRequestId;
  }

  applyResponse(requestId: number, result: DistinctResult): void {
    if (requestId !== this.lastRequestId) {
      return;
    }
    this.currentItems = result.items;
    this.currentTruncated = result.truncated;
    this.currentTotalCount = result.totalCount;
    if (!result.truncated) {
      const present = new Set(result.items.map((item) => item.value));
      this.selected.forEach((value) => {
        if (!present.has(value)) {
          this.selected.delete(value);
        }
      });
    }
  }

  toggle(value: FilterValue): void {
    if (this.selected.has(value)) {
      this.selected.delete(value);
    } else {
      this.selected.add(value);
    }
  }

  isSelected(value: FilterValue): boolean {
    return this.selected.has(value);
  }

  selectAll(): void {
    this.currentItems.forEach((item) => this.selected.add(item.value));
  }

  clear(): void {
    this.selected.clear();
  }

  /** `undefined` — фильтра нет: ничего не выбрано или выбран весь полный список. */
  toValues(): FilterValue[] | undefined {
    if (this.selected.size === 0) {
      return undefined;
    }
    if (!this.currentTruncated && this.allSelected) {
      return undefined;
    }
    return Array.from(this.selected);
  }
}

/** Список колонки `field` перезагружается, когда изменился фильтр любой другой колонки. */
export function needsReload(
  prev: GridFilterState,
  next: GridFilterState,
  field: string
): boolean {
  return othersKey(prev, field) !== othersKey(next, field);
}

function othersKey(state: GridFilterState, field: string): string {
  const active = Object.keys(state)
    .filter((key) => key !== field && isColumnFilterActive(state[key]))
    .sort()
    .map((key) => [key, buildColumnExpression(key, state[key])]);
  return JSON.stringify(active);
}

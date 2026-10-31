import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { PositionConfig } from 'devextreme/animation/position';
import { Subscription } from 'rxjs';

import { DataService } from '../../core/data.service';
import {
  ColumnFilterState,
  ColumnKind,
  FilterExpression,
  FilterValue,
  GridFilterState,
} from '../../models/column-filter.model';
import { DependentMultiCheckboxFilterComponent } from './dependent-multi-checkbox-filter.component';
import {
  buildColumnExpression,
  buildFilterExpression,
  isColumnFilterActive,
} from './filter-expression';

export { ColumnKind };

export interface FilterColumn {
  field: string;
  caption: string;
  kind: ColumnKind;
}

export interface ColumnFilterApply {
  field: string;
  /** `null` — фильтр колонки снят. */
  value: ColumnFilterState | null;
}

interface Bounds<T> {
  min: T;
  max: T;
}

const POPUP_WIDTH_PX = 440;

/**
 * Popup фильтра колонки: список значений и, для чисел и дат, диапазон в том
 * же окне. Черновик живёт здесь до «Применить»; список получает фильтр
 * остальных колонок плюс диапазон своей колонки из черновика.
 */
@Component({
  selector: 'app-column-filter-popup',
  templateUrl: './column-filter-popup.component.html',
  styleUrls: ['./column-filter-popup.component.css'],
})
export class ColumnFilterPopupComponent implements OnChanges, OnDestroy {
  @Input() column: FilterColumn | null = null;
  @Input() target: HTMLElement | null = null;
  @Input() state: GridFilterState = {};
  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() apply = new EventEmitter<ColumnFilterApply>();

  @ViewChild(DependentMultiCheckboxFilterComponent)
  list?: DependentMultiCheckboxFilterComponent;

  readonly width = POPUP_WIDTH_PX;
  readonly wrapperAttr: Record<string, string> = {
    'data-testid': 'column-filter-popup',
  };
  position: PositionConfig = this.positionFor(null);

  /** Состояние колонки на момент открытия: начальные значения дочерних компонентов. */
  initialState?: ColumnFilterState;
  listFilter: FilterExpression | null = null;
  dateBounds: Bounds<string> | null = null;
  numberBounds: Bounds<number> | null = null;
  boundsError: string | null = null;

  private draftValues?: FilterValue[];
  private draftRange: Pick<ColumnFilterState, 'from' | 'to'> = {};
  private othersFilter: FilterExpression | null = null;
  private statsRequest: Subscription | null = null;

  constructor(private readonly data: DataService) {}

  get hasRange(): boolean {
    return this.column?.kind === 'number' || this.column?.kind === 'date';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.target) {
      this.position = this.positionFor(this.target);
    }
    const opened = changes.visible !== undefined && this.visible;
    const switched = changes.column !== undefined && this.visible;
    if ((opened || switched) && this.column !== null) {
      this.open(this.column);
    } else if (changes.visible !== undefined && !this.visible) {
      this.cancelStats();
    }
  }

  ngOnDestroy(): void {
    this.cancelStats();
  }

  onPopupVisibleChange(visible: boolean): void {
    if (visible !== this.visible) {
      this.visible = visible;
      this.visibleChange.emit(visible);
    }
  }

  onValuesChange(values: FilterValue[] | undefined): void {
    this.draftValues = values;
  }

  onRangeChange(range: Pick<ColumnFilterState, 'from' | 'to'>): void {
    this.draftRange = range;
    this.updateListFilter();
  }

  onApply(): void {
    if (this.column === null) {
      return;
    }
    const value: ColumnFilterState = { ...this.draftRange };
    if (this.draftValues !== undefined && this.draftValues.length > 0) {
      value.values = this.draftValues;
      value.texts = this.textsFor(this.draftValues);
    }
    this.apply.emit({
      field: this.column.field,
      value: isColumnFilterActive(value) ? value : null,
    });
    this.close();
  }

  onClear(): void {
    if (this.column !== null) {
      this.apply.emit({ field: this.column.field, value: null });
    }
    this.close();
  }

  onCancel(): void {
    this.close();
  }

  private open(column: FilterColumn): void {
    const current = this.state[column.field];
    this.initialState = current;
    this.draftValues = current?.values;
    this.draftRange = pickRange(current);
    this.othersFilter = buildFilterExpression(this.state, column.field);
    this.updateListFilter();
    this.dateBounds = null;
    this.numberBounds = null;
    this.boundsError = null;
    if (this.hasRange) {
      this.loadBounds(column);
    } else {
      this.cancelStats();
    }
  }

  private close(): void {
    this.onPopupVisibleChange(false);
  }

  private updateListFilter(): void {
    if (this.column === null) {
      return;
    }
    const own = buildColumnExpression(this.column.field, this.draftRange);
    this.listFilter = and(this.othersFilter, own);
  }

  /** Подписка до отписки от прежнего запроса: так DataService видит и считает отменённый. */
  private loadBounds(column: FilterColumn): void {
    const previous = this.statsRequest;
    this.statsRequest = this.data
      .stats(column.field, this.othersFilter)
      .subscribe({
        next: ({ min, max }) => {
          if (
            column.kind === 'number' &&
            typeof min === 'number' &&
            typeof max === 'number'
          ) {
            this.numberBounds = { min, max };
          }
          if (
            column.kind === 'date' &&
            typeof min === 'string' &&
            typeof max === 'string'
          ) {
            this.dateBounds = { min, max };
          }
        },
        error: (e: Error) => {
          this.boundsError = e.message;
        },
      });
    previous?.unsubscribe();
  }

  private cancelStats(): void {
    this.statsRequest?.unsubscribe();
    this.statsRequest = null;
  }

  /** Текст для чипа: из полученных списков, иначе из прежнего состояния, иначе само значение. */
  private textsFor(values: FilterValue[]): Record<string, string> {
    const previous = this.initialState?.texts ?? {};
    const texts: Record<string, string> = {};
    values.forEach((value) => {
      const key = String(value);
      texts[key] = this.list?.textOf(value) ?? previous[key] ?? key;
    });
    return texts;
  }

  private positionFor(target: HTMLElement | null): PositionConfig {
    return {
      my: 'left top',
      at: 'left bottom',
      of: target ?? window,
      collision: 'fit flip',
    };
  }
}

function pickRange(
  s: ColumnFilterState | undefined
): Pick<ColumnFilterState, 'from' | 'to'> {
  const range: Pick<ColumnFilterState, 'from' | 'to'> = {};
  if (s?.from !== null && s?.from !== undefined) {
    range.from = s.from;
  }
  if (s?.to !== null && s?.to !== undefined) {
    range.to = s.to;
  }
  return range;
}

function and(
  a: FilterExpression | null,
  b: FilterExpression | null
): FilterExpression | null {
  if (a === null) {
    return b;
  }
  if (b === null) {
    return a;
  }
  return [a, 'and', b];
}

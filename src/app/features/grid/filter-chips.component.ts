import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
} from '@angular/core';

import {
  ColumnFilterState,
  ColumnKind,
  FilterValue,
  GridFilterState,
} from '../../models/column-filter.model';

export interface FilterChipColumn {
  field: string;
  caption: string;
  kind: ColumnKind;
}

export interface FilterChip {
  field: string;
  caption: string;
  text: string;
}

/** Сколько значений показывается в чипе; остальные сворачиваются в «ещё N». */
const MAX_VALUES_IN_CHIP = 3;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Строка чипов «Колонка: значение ×» над гридом вместо штатного filterPanel. */
@Component({
  selector: 'app-filter-chips',
  templateUrl: './filter-chips.component.html',
  styleUrls: ['./filter-chips.component.css'],
})
export class FilterChipsComponent implements OnChanges {
  @Input() columns: FilterChipColumn[] = [];
  @Input() state: GridFilterState = {};
  /** Поле колонки, фильтр которой снят крестиком. */
  @Output() remove = new EventEmitter<string>();
  @Output() clear = new EventEmitter<void>();

  chips: FilterChip[] = [];

  ngOnChanges(): void {
    this.chips = buildChips(this.columns, this.state);
  }

  trackByField(_: number, chip: FilterChip): string {
    return chip.field;
  }
}

/** Чипы в порядке колонок; колонка не из списка подписывается именем поля. */
export function buildChips(
  columns: FilterChipColumn[],
  state: GridFilterState
): FilterChip[] {
  const known = new Map(columns.map((column) => [column.field, column]));
  const fields = [
    ...columns.map((column) => column.field).filter((field) => field in state),
    ...Object.keys(state).filter((field) => !known.has(field)),
  ];
  const chips: FilterChip[] = [];
  fields.forEach((field) => {
    const column = known.get(field);
    const text = chipText(column?.kind ?? 'string', state[field]);
    if (text !== '') {
      chips.push({ field, caption: column?.caption ?? field, text });
    }
  });
  return chips;
}

export function chipText(kind: ColumnKind, s: ColumnFilterState): string {
  const parts: string[] = [];
  if (s.values !== undefined && s.values.length > 0) {
    parts.push(valuesText(s.values, s.texts ?? {}));
  }
  const range = rangeText(kind, s);
  if (range !== '') {
    parts.push(range);
  }
  return parts.join(', ');
}

function valuesText(
  values: FilterValue[],
  texts: Record<string, string>
): string {
  const shown = values
    .slice(0, MAX_VALUES_IN_CHIP)
    .map((value) => texts[String(value)] ?? String(value));
  const rest = values.length - shown.length;
  return rest > 0 ? `${shown.join(', ')}, ещё ${rest}` : shown.join(', ');
}

function rangeText(kind: ColumnKind, s: ColumnFilterState): string {
  const parts: string[] = [];
  if (s.from !== null && s.from !== undefined) {
    parts.push(`с ${boundText(kind, s.from)}`);
  }
  if (s.to !== null && s.to !== undefined) {
    parts.push(`по ${boundText(kind, s.to)}`);
  }
  return parts.join(' ');
}

function boundText(kind: ColumnKind, value: FilterValue): string {
  if (typeof value === 'number') {
    return value.toLocaleString('ru-RU');
  }
  const iso = kind === 'date' ? ISO_DATE.exec(value) : null;
  return iso === null ? value : `${iso[3]}.${iso[2]}.${iso[1]}`;
}

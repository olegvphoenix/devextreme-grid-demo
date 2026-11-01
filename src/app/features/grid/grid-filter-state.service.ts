import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { StorageService } from '../../core/storage.service';
import {
  ColumnFilterState,
  FilterValue,
  GridFilterState,
} from '../../models/column-filter.model';
import { GRID_COLUMNS } from './grid-columns';

const STORAGE_KEY = 'filters';
/** Грид бросает E1047 на условие по полю, которого нет среди его колонок. */
const KNOWN_FIELDS: string[] = GRID_COLUMNS.map((column) => column.field);

/**
 * Единственный источник фильтров страницы грида: грид получает их через
 * `filterValue`, чипы — через `state$`; каждое изменение сразу в хранилище.
 */
@Injectable({ providedIn: 'root' })
export class GridFilterStateService {
  private readonly subject: BehaviorSubject<GridFilterState>;

  readonly state$: Observable<GridFilterState>;

  constructor(private readonly storage: StorageService) {
    this.subject = new BehaviorSubject<GridFilterState>(
      readFilterState(storage.read<unknown>(STORAGE_KEY, null))
    );
    this.state$ = this.subject.asObservable();
  }

  get snapshot(): GridFilterState {
    return this.subject.value;
  }

  set(field: string, value: ColumnFilterState | null): void {
    const next = { ...this.snapshot };
    if (value === null) {
      delete next[field];
    } else {
      next[field] = value;
    }
    this.publish(next);
  }

  clearAll(): void {
    this.publish({});
  }

  /** Страница настроек меняет хранилище мимо службы: при открытии грида состояние перечитывается. */
  reload(): void {
    this.subject.next(
      readFilterState(this.storage.read<unknown>(STORAGE_KEY, null))
    );
  }

  private publish(state: GridFilterState): void {
    this.storage.write(STORAGE_KEY, state);
    this.subject.next(state);
  }
}

/** Из хранилища берутся только колонки грида, и только в форме состояния колонки. */
function readFilterState(raw: unknown): GridFilterState {
  const state: GridFilterState = {};
  if (!isRecord(raw)) {
    return state;
  }
  Object.entries(raw).forEach(([field, column]) => {
    const parsed = KNOWN_FIELDS.includes(field)
      ? readColumnState(column)
      : null;
    if (parsed !== null) {
      state[field] = parsed;
    }
  });
  return state;
}

function readColumnState(raw: unknown): ColumnFilterState | null {
  if (!isRecord(raw)) {
    return null;
  }
  const column: ColumnFilterState = {};
  if (Array.isArray(raw.values)) {
    const values = raw.values.filter(isFilterValue);
    if (values.length > 0) {
      column.values = values;
    }
  }
  if (isFilterValue(raw.from)) {
    column.from = raw.from;
  }
  if (isFilterValue(raw.to)) {
    column.to = raw.to;
  }
  if (isRecord(raw.texts)) {
    const texts: Record<string, string> = {};
    Object.entries(raw.texts).forEach(([key, text]) => {
      if (typeof text === 'string') {
        texts[key] = text;
      }
    });
    if (Object.keys(texts).length > 0) {
      column.texts = texts;
    }
  }
  return Object.keys(column).length === 0 ? null : column;
}

function isFilterValue(value: unknown): value is FilterValue {
  return typeof value === 'string' || typeof value === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

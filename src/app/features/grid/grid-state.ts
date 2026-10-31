import { StorageService } from '../../core/storage.service';
import { DATASET_SIZES, DatasetSize } from '../../models/dataset.model';
import { SelectionMode } from '../../models/selection-mode.model';

export type WidthMode = 'fit' | 'scroll';

export interface GridPageSettings {
  dataset: DatasetSize;
  widthMode: WidthMode;
  selectionMode: SelectionMode;
}

/** Колонка в `dxDataGrid.state()`; остальные поля DevExtreme проходят как есть. */
export interface DxGridColumnState {
  dataField?: string;
  name?: string;
  visibleIndex?: number;
  visible?: boolean;
  width?: number | string;
  sortOrder?: 'asc' | 'desc';
  sortIndex?: number;
  groupIndex?: number;
  fixed?: boolean;
  fixedPosition?: 'left' | 'right';
  [option: string]: unknown;
}

/** Состояние `dxDataGrid.state()`: типизированы поля, которые читает страница. */
export interface DxGridState {
  columns?: DxGridColumnState[];
  pageIndex?: number;
  pageSize?: number;
  filterValue?: unknown;
  selectedRowKeys?: unknown[];
  [option: string]: unknown;
}

export type ColumnWidths = Record<string, number>;

export const DEFAULT_PAGE_SETTINGS: GridPageSettings = {
  dataset: 1000,
  widthMode: 'fit',
  selectionMode: 'none',
};

const WIDTH_MODES: WidthMode[] = ['fit', 'scroll'];
const SELECTION_MODES: SelectionMode[] = [
  'none',
  'row',
  'multi-checkbox',
  'multi-plain',
  'cells',
];

/**
 * Сколько выбранных строк переживает перезагрузку. Ключи не с текущей страницы
 * грид догружает запросом с фильтром `or` по ключам; фильтр длиннее 1500
 * символов (`selection.maxFilterLengthInRequest`, в типах 23.2 не вынесен) он
 * заменяет запросом всего набора без фильтра — на 1 000 000 строк это 343 МБ.
 * Длина меряется как `encodeURI(JSON.stringify(filter))`: скобки и кавычки
 * стоят по три символа, семизначный ключ — 40 символов, 38 ключей уже 1516.
 * 30 ключей дают 1196 — с запасом; тест держит число под пределом.
 */
export const MAX_RESTORED_SELECTION = 30;

const KEY_STATE = 'state';
const KEY_DATASET = 'dataset';
const KEY_WIDTH_MODE = 'width-mode';
const KEY_SELECTION_MODE = 'selection-mode';
const KEY_SCROLL_WIDTHS = 'scroll-widths';

/** Фильтры живут в состоянии страницы, грид получает их отдельно. */
export function stripVolatileState(state: DxGridState): DxGridState {
  const { filterValue, ...rest } = state;
  return rest;
}

/** Выбор сверх предела не сохраняется целиком: частичное восстановление хуже отсутствия. */
export function limitSelectedRowKeys(state: DxGridState): DxGridState {
  if (
    state.selectedRowKeys === undefined ||
    state.selectedRowKeys.length <= MAX_RESTORED_SELECTION
  ) {
    return state;
  }
  const { selectedRowKeys, ...rest } = state;
  return rest;
}

export function detachWidths(state: DxGridState): {
  state: DxGridState;
  widths: ColumnWidths;
} {
  const widths: ColumnWidths = {};
  if (state.columns === undefined) {
    return { state: { ...state }, widths };
  }
  const columns = state.columns.map((column) => {
    const { width, ...rest } = column;
    const field = columnKey(column);
    if (field !== undefined && typeof width === 'number') {
      widths[field] = width;
    }
    return rest;
  });
  return { state: { ...state, columns }, widths };
}

export function attachWidths(
  state: DxGridState,
  widths: ColumnWidths
): DxGridState {
  if (state.columns === undefined) {
    return { ...state };
  }
  const columns = state.columns.map((column) => {
    const field = columnKey(column);
    return field !== undefined && field in widths
      ? { ...column, width: widths[field] }
      : { ...column };
  });
  return { ...state, columns };
}

export function readPageSettings(storage: StorageService): GridPageSettings {
  return {
    dataset: oneOf(
      storage.read<unknown>(KEY_DATASET, null),
      DATASET_SIZES,
      DEFAULT_PAGE_SETTINGS.dataset
    ),
    widthMode: oneOf(
      storage.read<unknown>(KEY_WIDTH_MODE, null),
      WIDTH_MODES,
      DEFAULT_PAGE_SETTINGS.widthMode
    ),
    selectionMode: oneOf(
      storage.read<unknown>(KEY_SELECTION_MODE, null),
      SELECTION_MODES,
      DEFAULT_PAGE_SETTINGS.selectionMode
    ),
  };
}

export function savePageSettings(
  storage: StorageService,
  settings: GridPageSettings
): void {
  storage.write(KEY_DATASET, settings.dataset);
  storage.write(KEY_WIDTH_MODE, settings.widthMode);
  storage.write(KEY_SELECTION_MODE, settings.selectionMode);
}

export function readGridState(storage: StorageService): DxGridState | null {
  const raw = storage.read<unknown>(KEY_STATE, null);
  return isRecord(raw)
    ? limitSelectedRowKeys(stripVolatileState(raw as DxGridState))
    : null;
}

export function saveGridState(
  storage: StorageService,
  state: DxGridState
): void {
  storage.write(KEY_STATE, limitSelectedRowKeys(stripVolatileState(state)));
}

export function readScrollWidths(storage: StorageService): ColumnWidths {
  const raw = storage.read<unknown>(KEY_SCROLL_WIDTHS, null);
  if (!isRecord(raw)) {
    return {};
  }
  const widths: ColumnWidths = {};
  Object.entries(raw).forEach(([field, width]) => {
    if (typeof width === 'number') {
      widths[field] = width;
    }
  });
  return widths;
}

export function saveScrollWidths(
  storage: StorageService,
  widths: ColumnWidths
): void {
  storage.write(KEY_SCROLL_WIDTHS, widths);
}

function columnKey(column: DxGridColumnState): string | undefined {
  return column.dataField ?? column.name;
}

function oneOf<T>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

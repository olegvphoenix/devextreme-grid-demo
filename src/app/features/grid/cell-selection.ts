import { SelectionColumnDisplayMode } from 'devextreme/common/grids';
import { SingleMultipleOrNone } from 'devextreme/common';
import dxDataGrid, { Column, Row, Selection } from 'devextreme/ui/data_grid';

import { ProductionRecord } from '../../models/production-record.model';
import { SelectionMode } from '../../models/selection-mode.model';

export type Grid = dxDataGrid<ProductionRecord, number>;
export type GridColumn = Column<ProductionRecord, number>;
export type GridRow = Row<ProductionRecord, number>;
export type DataColumn = GridColumn & { dataField: string };

export interface CellKey {
  rowKey: number;
  field: string;
}

export interface ClickModifiers {
  ctrl: boolean;
  shift: boolean;
}

/** Порядок строк и колонок на странице: по нему строится прямоугольник Shift. */
export interface CellOrder {
  rowKeys: number[];
  fields: string[];
}

/** Класс выделенной ячейки; ставится в `onCellPrepared`, иначе перерисовка его теряет. */
export const SELECTED_CELL_CLASS = 'grid-cell--selected';

/**
 * Режима выделения ячеек в DataGrid 23.2 нет: своё состояние, клики через
 * `onCellClick`. Клик — одна ячейка, Ctrl — переключить, Shift — прямоугольник
 * от опорной ячейки, Ctrl+Shift — добавить прямоугольник к выделению.
 */
export class CellSelection {
  private readonly selected = new Map<string, CellKey>();
  private anchor: CellKey | null = null;

  get cells(): CellKey[] {
    return Array.from(this.selected.values());
  }

  get count(): number {
    return this.selected.size;
  }

  click(cell: CellKey, mods: ClickModifiers, order: CellOrder): void {
    if (mods.shift && this.anchor !== null) {
      const rectangle = rectangleOf(this.anchor, cell, order);
      if (rectangle !== null) {
        if (!mods.ctrl) {
          this.selected.clear();
        }
        rectangle.forEach((item) => this.selected.set(keyOf(item), item));
        return;
      }
    }
    if (mods.ctrl) {
      const key = keyOf(cell);
      if (this.selected.has(key)) {
        this.selected.delete(key);
      } else {
        this.selected.set(key, cell);
      }
    } else {
      this.selected.clear();
      this.selected.set(keyOf(cell), cell);
    }
    this.anchor = cell;
  }

  has(cell: CellKey): boolean {
    return this.selected.has(keyOf(cell));
  }

  clear(): void {
    this.selected.clear();
    this.anchor = null;
  }
}

/** Штатные опции `selection` для режима страницы; «ячейки» для грида — отсутствие выделения. */
export function selectionOptions(mode: SelectionMode): {
  mode: SingleMultipleOrNone;
  showCheckBoxesMode: SelectionColumnDisplayMode;
} {
  switch (mode) {
    case 'row':
      return { mode: 'single', showCheckBoxesMode: 'none' };
    case 'multi-checkbox':
      return { mode: 'multiple', showCheckBoxesMode: 'always' };
    case 'multi-plain':
      return { mode: 'multiple', showCheckBoxesMode: 'none' };
    case 'none':
    case 'cells':
      return { mode: 'none', showCheckBoxesMode: 'none' };
  }
}

/**
 * `selection` грида для режима страницы. `selectAllMode: 'page'`: в режиме
 * `allPages` «выбрать всё» грузит в браузер весь набор под фильтром без
 * `take` — на 1 000 000 строк это сотни мегабайт.
 */
export function gridSelection(mode: SelectionMode): Selection {
  return {
    ...selectionOptions(mode),
    allowSelectAll: true,
    selectAllMode: 'page',
  };
}

/** Выделяются только ячейки данных в колонках с полем: без заголовков, групп и служебных колонок. */
export function isSelectableCell<
  C extends { dataField?: string; type?: string }
>(rowType: string, column: C): column is C & { dataField: string } {
  return (
    rowType === 'data' &&
    column.type === undefined &&
    column.dataField !== undefined
  );
}

/** Строки данных страницы в порядке грида: без групповых строк. */
export function dataRows(grid: Grid): GridRow[] {
  return grid.getVisibleRows().filter((row) => row.rowType === 'data');
}

/** Видимые колонки с полем в порядке грида: без чекбоксов, кнопок и раскрытия групп. */
export function dataColumns(grid: Grid): DataColumn[] {
  return grid
    .getVisibleColumns()
    .filter((column): column is DataColumn =>
      isSelectableCell('data', column)
    );
}

export function cellOrder(grid: Grid): CellOrder {
  return {
    rowKeys: dataRows(grid).map((row) => row.key),
    fields: dataColumns(grid).map((column) => column.dataField),
  };
}

/** Атрибут поля на ячейке данных: ставится в `onCellPrepared`, по нему ячейка находится без API грида. */
export const CELL_FIELD_ATTR = 'data-field';

/**
 * Переставляет класс в строках, где выделение изменилось, прямым обходом их
 * `td`: `getCellElement` на каждую из 7 000 ячеек страницы в 500 строк стоит
 * секунды, обход строк — миллисекунды.
 */
export function syncCellClasses(
  grid: Grid,
  previous: CellKey[],
  selection: CellSelection
): void {
  const wasSelected = new Set(previous.map(keyOf));
  const changedRows = new Set<number>();
  previous.forEach((cell) => {
    if (!selection.has(cell)) {
      changedRows.add(cell.rowKey);
    }
  });
  selection.cells.forEach((cell) => {
    if (!wasSelected.has(keyOf(cell))) {
      changedRows.add(cell.rowKey);
    }
  });
  dataRows(grid).forEach((row) => {
    if (!changedRows.has(row.key)) {
      return;
    }
    (grid.getRowElement(row.rowIndex) ?? []).forEach((rowElement) => {
      rowElement.querySelectorAll(`td[${CELL_FIELD_ATTR}]`).forEach((cell) => {
        const field = cell.getAttribute(CELL_FIELD_ATTR) ?? '';
        cell.classList.toggle(
          SELECTED_CELL_CLASS,
          selection.has({ rowKey: row.key, field })
        );
      });
    });
  });
}

function keyOf(cell: CellKey): string {
  return `${cell.rowKey}\u0000${cell.field}`;
}

function rectangleOf(
  from: CellKey,
  to: CellKey,
  order: CellOrder
): CellKey[] | null {
  const rows = [from.rowKey, to.rowKey].map((k) => order.rowKeys.indexOf(k));
  const cols = [from.field, to.field].map((f) => order.fields.indexOf(f));
  if (rows.includes(-1) || cols.includes(-1)) {
    return null;
  }
  const cells: CellKey[] = [];
  for (let r = Math.min(...rows); r <= Math.max(...rows); r++) {
    for (let c = Math.min(...cols); c <= Math.max(...cols); c++) {
      cells.push({ rowKey: order.rowKeys[r], field: order.fields[c] });
    }
  }
  return cells;
}

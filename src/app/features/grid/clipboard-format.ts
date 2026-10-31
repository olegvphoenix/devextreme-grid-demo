import { ColumnCustomizeTextArg } from 'devextreme/common/grids';
import { Format, formatDate, formatNumber } from 'devextreme/localization';

import { ProductionRecord } from '../../models/production-record.model';
import {
  CellKey,
  CellSelection,
  dataColumns,
  dataRows,
  Grid,
} from './cell-selection';

/** Часть колонки грида, нужная для текста ячейки; `getVisibleColumns()` отдаёт её целиком. */
export interface TextColumn {
  dataField?: string;
  caption?: string;
  format?: Format;
  calculateCellValue?: (rowData: ProductionRecord) => unknown;
  customizeText?: (cellInfo: ColumnCustomizeTextArg) => string;
}

export interface ClipboardTable {
  header: string[];
  rows: string[][];
}

const NEEDS_QUOTES = /["\t\r\n]/;

/** TSV для вставки в Excel: `\t` между ячейками, `\r\n` между строками, кавычки по правилам Excel. */
export function toExcelText(header: string[], rows: string[][]): string {
  return [header, ...rows]
    .map((row) => row.map(escapeCell).join('\t'))
    .join('\r\n');
}

/**
 * Текст ячейки как в гриде: значение колонки (`calculateCellValue` снимает
 * сериализацию даты), формат колонки в текущей локали, затем `customizeText`.
 */
export function cellText(column: TextColumn, data: ProductionRecord): string {
  const value =
    column.calculateCellValue === undefined
      ? undefined
      : column.calculateCellValue.call(column, data);
  const valueText = formatValue(value, column.format);
  return column.customizeText === undefined
    ? valueText
    : column.customizeText.call(column, { value, valueText, target: 'row' });
}

/** Таблица выбранных строк: заголовки видимых колонок и отображаемые значения. */
export function rowTable(
  rows: ProductionRecord[],
  columns: TextColumn[]
): ClipboardTable {
  return {
    header: columns.map((column) => column.caption ?? ''),
    rows: rows.map((row) => columns.map((column) => cellText(column, row))),
  };
}

/**
 * Таблица выбранных ячеек: строки и колонки, в которых есть хоть одна
 * выделенная ячейка, в порядке страницы; невыделенные места пустые.
 */
export function cellTable(
  cells: CellKey[],
  rowKeys: number[],
  columns: TextColumn[],
  dataOf: (rowKey: number) => ProductionRecord | undefined
): ClipboardTable {
  const pageRows = new Set(rowKeys);
  const pageFields = new Set(columns.map((column) => column.dataField));
  const live = cells.filter(
    (cell) => pageRows.has(cell.rowKey) && pageFields.has(cell.field)
  );
  const selectedRows = new Set(live.map((cell) => cell.rowKey));
  const selectedFields = new Set(live.map((cell) => cell.field));
  const selected = new Set(
    live.map((cell) => `${cell.rowKey}\u0000${cell.field}`)
  );
  const tableColumns = columns.filter(
    (column) =>
      column.dataField !== undefined && selectedFields.has(column.dataField)
  );
  const rows: string[][] = [];
  rowKeys.forEach((rowKey) => {
    const data = dataOf(rowKey);
    if (!selectedRows.has(rowKey) || data === undefined) {
      return;
    }
    rows.push(
      tableColumns.map((column) =>
        selected.has(`${rowKey}\u0000${column.dataField}`)
          ? cellText(column, data)
          : ''
      )
    );
  });
  return { header: tableColumns.map((column) => column.caption ?? ''), rows };
}

/**
 * Что копировать из грида: выделенные ячейки или выбранные строки. `null`,
 * когда данные части выбранных строк ещё не загружены гридом — лучше отказ,
 * чем молча неполная таблица.
 */
export function selectionTable(
  grid: Grid,
  cells: CellSelection | null
): ClipboardTable | null {
  const columns = dataColumns(grid);
  const rows = dataRows(grid);
  const pageKeys = rows.map((row) => row.key);
  if (cells !== null) {
    const byKey = new Map(rows.map((row) => [row.key, row.data]));
    return cellTable(cells.cells, pageKeys, columns, (key) => byKey.get(key));
  }
  const selected: ProductionRecord[] = grid.getSelectedRowsData();
  if (selected.length !== grid.getSelectedRowKeys().length) {
    return null;
  }
  return rowTable(orderByVisible(selected, pageKeys, (row) => row.id), columns);
}

/** Строки текущей страницы в её порядке, затем остальные в исходном порядке. */
export function orderByVisible<T>(
  rows: T[],
  visibleKeys: number[],
  keyOf: (row: T) => number
): T[] {
  const position = new Map(visibleKeys.map((key, index) => [key, index]));
  const visible = rows
    .filter((row) => position.has(keyOf(row)))
    .sort((a, b) => position.get(keyOf(a))! - position.get(keyOf(b))!);
  const rest = rows.filter((row) => !position.has(keyOf(row)));
  return [...visible, ...rest];
}

function formatValue(value: unknown, format: Format | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return formatDate(value, format ?? 'shortDate');
  }
  if (typeof value === 'number' && format !== undefined) {
    return formatNumber(value, format);
  }
  return String(value);
}

function escapeCell(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

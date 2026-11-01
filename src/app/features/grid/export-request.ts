import dxDataGrid from 'devextreme/ui/data_grid';

import { FilterExpression } from '../../models/column-filter.model';
import {
  ExportColumn,
  ExportRequest,
  GroupItem,
  SortItem,
} from '../../models/load-options.model';
import { DxGridColumnState, DxGridState } from './grid-state';

export type ExportKind = 'xlsx' | 'pdf';
/** Кто строит файл: сервер по запросу страницы или сам грид (`exportDataGrid`). */
export type ExportSource = 'server' | 'grid';

/** Часть грида, по которой собирается запрос экспорта; настоящий dxDataGrid подходит. */
export type ExportGrid = Pick<dxDataGrid, 'state' | 'columnOption'>;

/** Строк на странице PDF сервера: A4 альбомная, как `PdfExporter.RowsPerPage`. */
export const PDF_ROWS_PER_PAGE = 45;
/** От этого числа строк экспорт в PDF запрашивает подтверждение с оценкой страниц. */
export const PDF_CONFIRM_ROWS = 100000;

/**
 * Запрос экспорта по текущему виду грида: сгруппированные колонки первыми в
 * порядке группировки — по ним сервер упорядочивает строки, — затем видимые в
 * порядке `visibleIndex`; скрытые, служебные (без поля) и `allowExporting:
 * false` не попадают. Фильтр приходит из состояния страницы, а не из грида.
 */
export function buildExportRequest(
  grid: ExportGrid,
  filter: FilterExpression | null
): ExportRequest {
  const state: DxGridState = grid.state();
  const columns = (state.columns ?? []).filter(hasDataField);
  const grouped = columns
    .filter((column) => isIndex(column.groupIndex))
    .sort((a, b) => a.groupIndex! - b.groupIndex!);
  const sorted = columns
    .filter(
      (column) =>
        isIndex(column.sortIndex) &&
        column.sortOrder !== undefined &&
        !isIndex(column.groupIndex)
    )
    .sort((a, b) => a.sortIndex! - b.sortIndex!);
  const visible = columns
    .filter(
      (column) =>
        !isIndex(column.groupIndex) &&
        column.visible !== false &&
        grid.columnOption(column.dataField, 'allowExporting') !== false
    )
    .sort((a, b) => (a.visibleIndex ?? 0) - (b.visibleIndex ?? 0));

  const request: ExportRequest = {
    columns: [...grouped, ...visible].map((column) =>
      exportColumn(grid, column)
    ),
    filter,
  };
  if (sorted.length > 0) {
    request.sort = sorted.map(sortItem);
  }
  if (grouped.length > 0) {
    request.group = grouped.map(sortItem);
  }
  return request;
}

export function estimatePdfPages(rowCount: number): number {
  return Math.max(1, Math.ceil(rowCount / PDF_ROWS_PER_PAGE));
}

export function exportFileName(
  source: ExportSource,
  kind: ExportKind,
  now: Date
): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}` +
    `_${two(now.getHours())}-${two(now.getMinutes())}-${two(now.getSeconds())}`;
  return `${source}-export-${stamp}.${kind}`;
}

type DataColumnState = DxGridColumnState & { dataField: string };

function hasDataField(column: DxGridColumnState): column is DataColumnState {
  return typeof column.dataField === 'string' && column.dataField.length > 0;
}

function isIndex(value: number | undefined): value is number {
  return typeof value === 'number' && value >= 0;
}

function sortItem(column: DataColumnState): SortItem | GroupItem {
  return { selector: column.dataField, desc: column.sortOrder === 'desc' };
}

function exportColumn(grid: ExportGrid, column: DataColumnState): ExportColumn {
  const caption: unknown = grid.columnOption(column.dataField, 'caption');
  return {
    field: column.dataField,
    caption:
      typeof caption === 'string' && caption.length > 0
        ? caption
        : column.dataField,
  };
}

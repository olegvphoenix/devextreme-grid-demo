import DevExpress from 'devextreme/bundles/dx.all';
import { DataType } from 'devextreme/common';

import { ColumnKind } from '../../models/column-filter.model';
import {
  ProductionRecord,
  RecordStatus,
  STATUS_NAMES,
} from '../../models/production-record.model';
import { DATE_FORMAT } from '../../shared/date-format';
import { ColumnWidths, WidthMode } from './grid-state';

export interface GridColumnDef {
  field: Extract<keyof ProductionRecord, string>;
  caption: string;
  kind: ColumnKind;
  /** Ширина в режиме «С прокруткой», px; в режиме «По ширине» не задаётся. */
  width: number;
  format?: string;
}

const WEIGHT_FORMAT = '#,##0.0';
const INTEGER_FORMAT = '#,##0';

export const GRID_COLUMNS: GridColumnDef[] = [
  { field: 'id', caption: 'Идентификатор', kind: 'number', width: 120 },
  {
    field: 'date',
    caption: 'Дата',
    kind: 'date',
    width: 110,
    format: DATE_FORMAT,
  },
  { field: 'plant', caption: 'Завод', kind: 'string', width: 140 },
  { field: 'line', caption: 'Линия', kind: 'string', width: 130 },
  { field: 'product', caption: 'Продукт', kind: 'string', width: 160 },
  { field: 'batch', caption: 'Партия', kind: 'string', width: 120 },
  {
    field: 'netWeight',
    caption: 'Нетто, кг',
    kind: 'number',
    width: 110,
    format: WEIGHT_FORMAT,
  },
  {
    field: 'grossWeight',
    caption: 'Брутто, кг',
    kind: 'number',
    width: 110,
    format: WEIGHT_FORMAT,
  },
  {
    field: 'qty',
    caption: 'Количество',
    kind: 'number',
    width: 120,
    format: INTEGER_FORMAT,
  },
  {
    field: 'markingCode',
    caption: 'Код маркировки',
    kind: 'string',
    width: 280,
  },
  { field: 'ean13', caption: 'Штрихкод EAN13', kind: 'string', width: 150 },
  { field: 'status', caption: 'Статус', kind: 'enum', width: 130 },
  { field: 'operator', caption: 'Оператор', kind: 'string', width: 150 },
  { field: 'labels', caption: 'Ярлыки', kind: 'labels', width: 180 },
];

export function defaultScrollWidths(defs: GridColumnDef[]): ColumnWidths {
  const widths: ColumnWidths = {};
  defs.forEach((def) => (widths[def.field] = def.width));
  return widths;
}

/**
 * Колонка в типе бандла, как у входа `columns` devextreme-angular: модульный
 * `Column` из `devextreme/ui/data_grid` TypeScript с ним не сравнивает
 * («Excessive stack depth»). Импорт только для типа, в сборку не попадает.
 */
export type DxColumn = DevExpress.ui.dxDataGridColumn;

export function toDxColumns(
  defs: GridColumnDef[],
  widthMode: WidthMode
): DxColumn[] {
  return defs.map((def) => {
    const column: DxColumn = {
      dataField: def.field,
      caption: def.caption,
      dataType: dataTypeOf(def.kind),
      allowHeaderFiltering: false,
    };
    if (widthMode === 'scroll') {
      column.width = def.width;
    }
    if (def.format !== undefined) {
      column.format = def.format;
    }
    if (def.kind === 'enum') {
      column.customizeText = (cell) => statusName(cell.value);
    }
    if (def.kind === 'labels') {
      column.allowSorting = false;
      column.allowGrouping = false;
      column.customizeText = (cell) => labelsText(cell.value);
    }
    return column;
  });
}

function dataTypeOf(kind: ColumnKind): DataType {
  switch (kind) {
    case 'number':
    case 'enum':
      return 'number';
    case 'date':
      return 'date';
    case 'labels':
      return 'object';
    case 'string':
      return 'string';
  }
}

function statusName(value: unknown): string {
  return typeof value === 'number' && value in STATUS_NAMES
    ? STATUS_NAMES[value as RecordStatus]
    : '';
}

function labelsText(value: unknown): string {
  return Array.isArray(value) ? value.join(', ') : '';
}

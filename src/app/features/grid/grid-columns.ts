import type DevExpress from 'devextreme/bundles/dx.all';
import { DataType } from 'devextreme/common';
import {
  Summary,
  SummaryGroupItem,
  SummaryTotalItem,
} from 'devextreme/ui/data_grid';

import { ColumnKind } from '../../models/column-filter.model';
import {
  ProductionRecord,
  RecordStatus,
  STATUS_NAMES,
} from '../../models/production-record.model';
import { DATE_FORMAT } from '../../shared/date-format';
import { ColumnWidths, FitWidths, WidthMode } from './grid-state';

export interface GridColumnDef {
  field: Extract<keyof ProductionRecord, string>;
  caption: string;
  kind: ColumnKind;
  /** Ширина в режиме «С прокруткой», px. */
  width: number;
  /** Доля страницы в режиме «По ширине», %. */
  fitPercent: number;
  format?: string;
}

const WEIGHT_FORMAT = '#,##0.0';
const INTEGER_FORMAT = '#,##0';
const ACTIONS_WIDTH = 100;

export const GRID_COLUMNS: GridColumnDef[] = [
  { field: 'id', caption: 'ID', kind: 'number', width: 120, fitPercent: 4 },
  {
    field: 'date',
    caption: 'Дата',
    kind: 'date',
    width: 110,
    fitPercent: 6,
    format: DATE_FORMAT,
  },
  {
    field: 'plant',
    caption: 'Завод',
    kind: 'string',
    width: 140,
    fitPercent: 7,
  },
  { field: 'line', caption: 'Линия', kind: 'string', width: 130, fitPercent: 6 },
  {
    field: 'product',
    caption: 'Продукт',
    kind: 'string',
    width: 160,
    fitPercent: 8,
  },
  {
    field: 'batch',
    caption: 'Партия',
    kind: 'string',
    width: 120,
    fitPercent: 5,
  },
  {
    field: 'netWeight',
    caption: 'Нетто, кг',
    kind: 'number',
    width: 110,
    fitPercent: 7,
    format: WEIGHT_FORMAT,
  },
  {
    field: 'grossWeight',
    caption: 'Брутто, кг',
    kind: 'number',
    width: 110,
    fitPercent: 7,
    format: WEIGHT_FORMAT,
  },
  {
    field: 'qty',
    caption: 'Кол-во',
    kind: 'number',
    width: 120,
    fitPercent: 7,
    format: INTEGER_FORMAT,
  },
  {
    field: 'markingCode',
    caption: 'Код маркировки',
    kind: 'string',
    width: 280,
    fitPercent: 7,
  },
  {
    field: 'ean13',
    caption: 'EAN13',
    kind: 'string',
    width: 150,
    fitPercent: 6,
  },
  {
    field: 'status',
    caption: 'Статус',
    kind: 'enum',
    width: 130,
    fitPercent: 7,
  },
  {
    field: 'operator',
    caption: 'Оператор',
    kind: 'string',
    width: 150,
    fitPercent: 7,
  },
  {
    field: 'labels',
    caption: 'Ярлыки',
    kind: 'labels',
    width: 180,
    fitPercent: 4,
  },
];

type AggregateField = 'netWeight' | 'grossWeight' | 'qty';

interface AggregateDef {
  column: AggregateField;
  summaryType: 'sum' | 'avg';
}

const AGGREGATES: AggregateDef[] = [
  { column: 'netWeight', summaryType: 'sum' },
  { column: 'netWeight', summaryType: 'avg' },
  { column: 'grossWeight', summaryType: 'sum' },
  { column: 'grossWeight', summaryType: 'avg' },
  { column: 'qty', summaryType: 'sum' },
];

function aggregateItem(def: AggregateDef): SummaryGroupItem & SummaryTotalItem {
  return {
    column: def.column,
    summaryType: def.summaryType,
    displayFormat: def.summaryType === 'sum' ? '∑ {0}' : 'ср. {0}',
    valueFormat: def.column === 'qty' ? INTEGER_FORMAT : WEIGHT_FORMAT,
  };
}

/**
 * Агрегаты групп и итогов; считает сервер (`remoteOperations.summary`).
 * Число строк группы — в заголовке группы, остальное — под своей колонкой.
 * Итоги в одну строку: подвал не должен отнимать высоту у данных.
 */
export const GRID_SUMMARY: Summary = {
  groupItems: [
    {
      summaryType: 'count',
      displayFormat: 'Строк: {0}',
      valueFormat: INTEGER_FORMAT,
    },
    ...AGGREGATES.map((def) => ({
      ...aggregateItem(def),
      alignByColumn: true,
    })),
  ],
  totalItems: [
    {
      column: 'id',
      showInColumn: 'product',
      summaryType: 'count',
      displayFormat: 'Всего строк: {0}',
      valueFormat: INTEGER_FORMAT,
    },
    ...AGGREGATES.filter((def) => def.summaryType === 'sum').map((def) => ({
      ...aggregateItem(def),
      valueFormat: INTEGER_FORMAT,
    })),
  ],
};

/** Имя `dxTemplate` заголовка на странице: подпись и кнопка фильтра. */
export const HEADER_CELL_TEMPLATE = 'headerCell';
/** Имена `dxTemplate` ячеек на странице: бейдж статуса и чипы ярлыков. */
export const STATUS_CELL_TEMPLATE = 'statusCell';
export const LABELS_CELL_TEMPLATE = 'labelsCell';

export type RowAction = 'open' | 'start' | 'close';

export function defaultScrollWidths(defs: GridColumnDef[]): ColumnWidths {
  const widths: ColumnWidths = {};
  defs.forEach((def) => (widths[def.field] = def.width));
  return widths;
}

export function defaultFitWidths(defs: GridColumnDef[]): FitWidths {
  const widths: FitWidths = { actions: ACTIONS_WIDTH };
  defs.forEach((def) => (widths[def.field] = fitWidth(def)));
  return widths;
}

function fitWidth(def: GridColumnDef): string {
  return `${def.fitPercent}%`;
}

/**
 * Колонка в типе бандла, как у входа `columns` devextreme-angular: модульный
 * `Column` из `devextreme/ui/data_grid` TypeScript с ним не сравнивает
 * («Excessive stack depth»). Импорт только для типа, в сборку не попадает.
 */
export type DxColumn = DevExpress.ui.dxDataGridColumn;
export type DxColumnButton = DevExpress.ui.dxDataGridColumnButton;

interface RowActionDef {
  name: RowAction;
  hint: string;
  icon: string;
}

const ROW_ACTIONS: RowActionDef[] = [
  { name: 'open', hint: 'Открыть', icon: 'find' },
  { name: 'start', hint: 'В работу', icon: 'runner' },
  { name: 'close', hint: 'Закрыть', icon: 'check' },
];

/**
 * Колонка действий: `type: 'buttons'`, без поля данных — её нет в выборе
 * колонок, в копировании и в экспорте. Закреплена справа, ширина под три
 * иконки; обработчик получает действие и ключ записи.
 */
export function actionsColumn(
  onAction: (action: RowAction, id: number) => void
): DxColumn {
  return {
    type: 'buttons',
    name: 'actions',
    caption: 'Действия',
    width: ACTIONS_WIDTH,
    fixed: true,
    fixedPosition: 'right',
    allowResizing: false,
    allowExporting: false,
    showInColumnChooser: false,
    buttons: ROW_ACTIONS.map((action) => ({
      name: action.name,
      hint: action.hint,
      icon: action.icon,
      onClick: (e) => {
        if (e.row !== undefined) {
          onAction(action.name, e.row.key);
        }
      },
    })),
  };
}

/**
 * Фильтр ярлыков идёт по служебному полю `labelsKey` (`|а|б|`, оператор
 * contains); грид принимает в `filterValue` только поля своих колонок,
 * поэтому поле заведено скрытой колонкой.
 */
export const LABELS_KEY_COLUMN: DxColumn = {
  dataField: 'labelsKey',
  dataType: 'string',
  visible: false,
  showInColumnChooser: false,
  allowFiltering: true,
  allowSorting: false,
  allowGrouping: false,
  allowHeaderFiltering: false,
};

export function toDxColumns(
  defs: GridColumnDef[],
  widthMode: WidthMode
): DxColumn[] {
  const columns = defs.map((def) => {
    const column: DxColumn = {
      dataField: def.field,
      caption: def.caption,
      dataType: dataTypeOf(def.kind),
      allowHeaderFiltering: false,
      headerCellTemplate: HEADER_CELL_TEMPLATE,
      width: widthMode === 'scroll' ? def.width : fitWidth(def),
    };
    if (def.format !== undefined) {
      column.format = def.format;
    }
    if (def.kind === 'date') {
      column.calculateFilterExpression = passThroughFilterExpression(
        def.field
      );
    }
    if (def.kind === 'enum') {
      column.cellTemplate = STATUS_CELL_TEMPLATE;
      column.customizeText = (cell) => statusName(cell.value);
    }
    if (def.kind === 'labels') {
      column.cellTemplate = LABELS_CELL_TEMPLATE;
      column.allowSorting = false;
      column.allowGrouping = false;
      column.customizeText = (cell) => labelsText(cell.value);
    }
    return column;
  });
  return [...columns, { ...LABELS_KEY_COLUMN }];
}

/**
 * Штатное выражение колонки даты ждёт `Date` или `yyyy/MM/dd` и разворачивает
 * `=` в сутки; строки `yyyy-MM-dd` с сервера оно превращает в Invalid Date.
 * Условие уходит на сервер как есть.
 */
function passThroughFilterExpression(
  field: string
): NonNullable<DxColumn['calculateFilterExpression']> {
  return (value: unknown, operation: string | null) => [
    field,
    operation ?? '=',
    value,
  ];
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

import { FilterExpression, FilterValue } from './column-filter.model';
import { ProductionRecord } from './production-record.model';

export interface SortItem {
  selector: string;
  desc?: boolean;
}

export interface GroupItem extends SortItem {
  isExpanded?: boolean;
}

export type SummaryType = 'sum' | 'avg' | 'min' | 'max' | 'count';

export interface SummaryItem {
  selector?: string;
  summaryType: SummaryType;
}

/** Параметры запроса страницы в формате DevExtreme, без привязки к гриду. */
export interface GridLoadOptions {
  skip?: number;
  take?: number;
  requireTotalCount?: boolean;
  requireGroupCount?: boolean;
  sort?: SortItem[];
  group?: GroupItem[];
  filter?: FilterExpression | null;
  totalSummary?: SummaryItem[];
  groupSummary?: SummaryItem[];
}

export interface GroupedRows {
  key: FilterValue;
  items: ProductionRecord[] | GroupedRows[] | null;
  count?: number;
  summary?: number[];
}

/** Ответ `DataSourceLoader`; незапрошенные `totalCount`/`groupCount` равны -1. */
export interface GridLoadResult {
  data: ProductionRecord[] | GroupedRows[];
  totalCount: number;
  groupCount: number;
  summary: number[] | null;
}

export interface ExportColumn {
  field: string;
  caption: string;
}

export interface ExportRequest {
  columns: ExportColumn[];
  sort?: SortItem[];
  group?: GroupItem[];
  filter?: FilterExpression | null;
}

import { FilterValue } from './column-filter.model';

export interface DistinctItem {
  value: FilterValue;
  text: string;
  count: number;
}

export interface DistinctResult {
  items: DistinctItem[];
  totalCount: number;
  truncated: boolean;
}

export interface ColumnStats {
  min: FilterValue | null;
  max: FilterValue | null;
  count: number;
}

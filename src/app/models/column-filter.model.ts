export type FilterValue = string | number;

export interface ColumnFilterState {
  values?: FilterValue[];
  from?: FilterValue | null;
  to?: FilterValue | null;
  /** Отображаемый текст по значению, для чипов фильтра. */
  texts?: Record<string, string>;
}

export type GridFilterState = Record<string, ColumnFilterState>;

export type FilterCondition = [string, string, FilterValue];

export type FilterExpression =
  | FilterCondition
  | Array<FilterExpression | 'and' | 'or'>;

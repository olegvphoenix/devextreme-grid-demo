import {
  ColumnFilterState,
  FilterCondition,
  FilterExpression,
  FilterValue,
  GridFilterState,
} from '../../models/column-filter.model';

/** Колонка ярлыков фильтруется по служебному полю `|а|б|` оператором contains. */
const LABELS_FIELD = 'labels';
const LABELS_KEY_FIELD = 'labelsKey';

export function isColumnFilterActive(
  s: ColumnFilterState | undefined
): boolean {
  if (s === undefined) {
    return false;
  }
  return (
    (s.values !== undefined && s.values.length > 0) ||
    isBound(s.from) ||
    isBound(s.to)
  );
}

export function buildColumnExpression(
  field: string,
  s: ColumnFilterState
): FilterExpression | null {
  const parts: FilterExpression[] = [];
  if (s.values !== undefined && s.values.length > 0) {
    parts.push(
      join(
        s.values.map((v) => valueCondition(field, v)),
        'or'
      )
    );
  }
  const bounds: FilterCondition[] = [];
  if (isBound(s.from)) {
    bounds.push([field, '>=', s.from]);
  }
  if (isBound(s.to)) {
    bounds.push([field, '<=', s.to]);
  }
  if (bounds.length > 0) {
    parts.push(join(bounds, 'and'));
  }
  return parts.length === 0 ? null : join(parts, 'and');
}

/** Все активные колонки через `and`, кроме `excludeField` (своя колонка зависимого списка). */
export function buildFilterExpression(
  state: GridFilterState,
  excludeField?: string
): FilterExpression | null {
  const parts: FilterExpression[] = [];
  Object.keys(state).forEach((field) => {
    if (field === excludeField) {
      return;
    }
    const expression = buildColumnExpression(field, state[field]);
    if (expression !== null) {
      parts.push(expression);
    }
  });
  return parts.length === 0 ? null : join(parts, 'and');
}

function valueCondition(field: string, value: FilterValue): FilterCondition {
  return field === LABELS_FIELD
    ? [LABELS_KEY_FIELD, 'contains', `|${value}|`]
    : [field, '=', value];
}

function isBound(
  value: FilterValue | null | undefined
): value is FilterValue {
  return value !== null && value !== undefined;
}

/** Одно выражение возвращается как есть, несколько — плоским списком без вложенности. */
function join(
  parts: FilterExpression[],
  operator: 'and' | 'or'
): FilterExpression {
  if (parts.length === 1) {
    return parts[0];
  }
  const result: Array<FilterExpression | 'and' | 'or'> = [];
  parts.forEach((part, index) => {
    if (index > 0) {
      result.push(operator);
    }
    result.push(part);
  });
  return result;
}

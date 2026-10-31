/**
 * Пустой dx-date-box или dx-number-box хранит `null` (так его и отдаёт
 * `reset()`), но тип опции `value` в devextreme 23.2 `null` не объявляет.
 * Единственное место, где это расхождение типов обходится.
 */
export function dxEditorValue<T extends string | number>(value: T | null): T {
  return value as T;
}

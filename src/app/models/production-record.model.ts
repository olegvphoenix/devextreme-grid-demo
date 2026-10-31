export type RecordStatus = 0 | 1 | 2 | 3;

export interface ProductionRecord {
  id: number;
  /** Дата производства в формате yyyy-MM-dd, без времени и часового пояса. */
  date: string;
  plant: string;
  line: string;
  product: string;
  batch: string;
  netWeight: number;
  grossWeight: number;
  qty: number;
  markingCode: string;
  ean13: string;
  status: RecordStatus;
  operator: string;
  labels: string[];
  /** Служебное поле для фильтра по ярлыку: `|а|б|` или пустая строка. */
  labelsKey: string;
}

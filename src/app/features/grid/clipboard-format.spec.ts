import { locale } from 'devextreme/localization';

import { ProductionRecord } from '../../models/production-record.model';
import { GRID_COLUMNS, toDxColumns } from './grid-columns';
import {
  cellTable,
  cellText,
  orderByVisible,
  rowTable,
  TextColumn,
  toExcelText,
} from './clipboard-format';

const record: ProductionRecord = {
  id: 1234567,
  date: '2021-05-09',
  plant: 'Завод Юг',
  line: 'Линия Ю-1',
  product: 'Сыр',
  batch: 'П-1',
  netWeight: 1234.5,
  grossWeight: 1300,
  qty: 42000,
  markingCode: '010460012345678921abc"def',
  ean13: '4600123456789',
  status: 2,
  operator: 'Иванов',
  labels: ['срочно', 'брак'],
  labelsKey: '|срочно|брак|',
};

/** Колонки грида как их отдаёт `getVisibleColumns`: своё `calculateCellValue` по полю. */
function gridColumns(): TextColumn[] {
  return toDxColumns(GRID_COLUMNS, 'fit')
    .filter((column) => column.visible !== false)
    .map((column) => ({
      ...column,
      calculateCellValue: (data: ProductionRecord) => {
        const value = data[column.dataField as keyof ProductionRecord];
        return column.dataType === 'date' && typeof value === 'string'
          ? new Date(value)
          : value;
      },
    }));
}

const byField = (field: string): TextColumn =>
  gridColumns().find((column) => column.dataField === field)!;

describe('toExcelText', () => {
  it('разделители Excel', () =>
    expect(toExcelText(['A', 'B'], [['1', '2']])).toBe('A\tB\r\n1\t2'));

  it('экранирует кавычки и переводы строк', () =>
    expect(toExcelText(['A'], [['x"y\nz']])).toBe('A\r\n"x""y\nz"'));

  it('значение с табуляцией берётся в кавычки', () =>
    expect(toExcelText(['A'], [['x\ty']])).toBe('A\r\n"x\ty"'));

  it('возврат каретки тоже берётся в кавычки, заголовки экранируются так же', () =>
    expect(toExcelText(['A"1'], [['x\ry']])).toBe('"A""1"\r\n"x\ry"'));

  it('без строк остаётся один заголовок', () =>
    expect(toExcelText(['A', 'B'], [])).toBe('A\tB'));
});

describe('cellText', () => {
  beforeAll(() => locale('ru'));
  afterAll(() => locale('en'));

  it('дата показывается как в гриде, dd.MM.yyyy', () => {
    expect(cellText(byField('date'), record)).toBe('09.05.2021');
  });

  it('числа форматируются форматом колонки в текущей локали', () => {
    expect(cellText(byField('netWeight'), record)).toBe('1 234,5');
    expect(cellText(byField('grossWeight'), record)).toBe('1 300,0');
    expect(cellText(byField('qty'), record)).toBe('42 000');
  });

  it('статус и ярлыки идут через customizeText колонки', () => {
    expect(cellText(byField('status'), record)).toBe('Агрегирован');
    expect(cellText(byField('labels'), record)).toBe('срочно, брак');
  });

  it('строки и идентификатор без формата идут как есть', () => {
    expect(cellText(byField('plant'), record)).toBe('Завод Юг');
    expect(cellText(byField('id'), record)).toBe('1234567');
  });

  it('пустое значение даёт пустую строку', () => {
    const column: TextColumn = {
      dataField: 'operator',
      calculateCellValue: () => null,
    };
    expect(cellText(column, record)).toBe('');
    expect(cellText({ dataField: 'operator' }, record)).toBe('');
  });
});

describe('rowTable', () => {
  beforeAll(() => locale('ru'));
  afterAll(() => locale('en'));

  it('заголовок из подписей видимых колонок, строка из отображаемых значений', () => {
    const columns = [byField('date'), byField('status'), byField('qty')];
    expect(rowTable([record], columns)).toEqual({
      header: ['Дата', 'Статус', 'Кол-во'],
      rows: [['09.05.2021', 'Агрегирован', '42 000']],
    });
  });

  it('колонка без подписи даёт пустой заголовок', () => {
    expect(
      rowTable([], [{ dataField: 'plant', calculateCellValue: () => 'x' }])
    ).toEqual({ header: [''], rows: [] });
  });
});

describe('cellTable', () => {
  const columns = [byField('plant'), byField('line'), byField('product')];
  const rows: Record<number, ProductionRecord> = {
    1: { ...record, id: 1, plant: 'P1', line: 'L1', product: 'X1' },
    2: { ...record, id: 2, plant: 'P2', line: 'L2', product: 'X2' },
    3: { ...record, id: 3, plant: 'P3', line: 'L3', product: 'X3' },
  };
  const data = (rowKey: number): ProductionRecord | undefined => rows[rowKey];

  it('берёт только строки и колонки с выделенными ячейками, порядок видимый', () => {
    const table = cellTable(
      [
        { rowKey: 3, field: 'product' },
        { rowKey: 1, field: 'plant' },
      ],
      [1, 2, 3],
      columns,
      data
    );
    expect(table).toEqual({
      header: ['Завод', 'Продукт'],
      rows: [
        ['P1', ''],
        ['', 'X3'],
      ],
    });
  });

  it('прямоугольник даёт полную таблицу', () => {
    const table = cellTable(
      [
        { rowKey: 1, field: 'plant' },
        { rowKey: 1, field: 'line' },
        { rowKey: 2, field: 'plant' },
        { rowKey: 2, field: 'line' },
      ],
      [1, 2, 3],
      columns,
      data
    );
    expect(table).toEqual({
      header: ['Завод', 'Линия'],
      rows: [
        ['P1', 'L1'],
        ['P2', 'L2'],
      ],
    });
  });

  it('ячейки строк и колонок, которых больше нет на странице, пропускаются', () => {
    const table = cellTable(
      [
        { rowKey: 9, field: 'plant' },
        { rowKey: 1, field: 'hidden' },
        { rowKey: 1, field: 'line' },
      ],
      [1, 2],
      columns,
      data
    );
    expect(table).toEqual({ header: ['Линия'], rows: [['L1']] });
  });
});

describe('orderByVisible', () => {
  const rows: { id: number }[] = [{ id: 5 }, { id: 2 }, { id: 9 }, { id: 1 }];

  it('видимые строки идут в порядке страницы, остальные после в исходном порядке', () => {
    expect(orderByVisible(rows, [1, 2, 3], (row) => row.id)).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 5 },
      { id: 9 },
    ]);
  });

  it('не мутирует исходный массив', () => {
    orderByVisible(rows, [9], (row) => row.id);
    expect(rows.map((row) => row.id)).toEqual([5, 2, 9, 1]);
  });
});

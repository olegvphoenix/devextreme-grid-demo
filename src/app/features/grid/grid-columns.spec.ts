import {
  GRID_COLUMNS,
  HEADER_CELL_TEMPLATE,
  LABELS_KEY_COLUMN,
  toDxColumns,
} from './grid-columns';

describe('toDxColumns', () => {
  const columns = toDxColumns(GRID_COLUMNS, 'fit');
  const byField = (field: string) =>
    columns.find((c) => c.dataField === field)!;

  it('каждая колонка данных рисует заголовок своим шаблоном с иконкой фильтра', () => {
    GRID_COLUMNS.forEach((def) => {
      expect(byField(def.field).headerCellTemplate)
        .withContext(def.field)
        .toBe(HEADER_CELL_TEMPLATE);
    });
  });

  it('колонка даты отдаёт условие фильтра как есть: строки yyyy-MM-dd не превращаются в Date', () => {
    const date = byField('date');
    const calculate = date.calculateFilterExpression!;
    expect(calculate.call(date, '2021-05-01', '=', 'filterBuilder')).toEqual([
      'date',
      '=',
      '2021-05-01',
    ]);
    expect(calculate.call(date, '2021-05-01', '>=', 'filterBuilder')).toEqual(
      ['date', '>=', '2021-05-01']
    );
    expect(calculate.call(date, '2021-05-01', null, 'filterBuilder')).toEqual([
      'date',
      '=',
      '2021-05-01',
    ]);
    expect(byField('netWeight').calculateFilterExpression).toBeUndefined();
  });

  it('служебная колонка labelsKey скрыта, без шаблона и не в списке колонок', () => {
    const last = columns[columns.length - 1];
    expect(last.dataField).toBe('labelsKey');
    expect(last.visible).toBeFalse();
    expect(last.showInColumnChooser).toBeFalse();
    expect(last.allowFiltering).toBeTrue();
    expect(last.headerCellTemplate).toBeUndefined();
    expect(columns.length).toBe(GRID_COLUMNS.length + 1);
    expect(LABELS_KEY_COLUMN.dataField).toBe('labelsKey');
  });

  it('ширины задаются только в режиме прокрутки', () => {
    expect(byField('id').width).toBeUndefined();
    expect(
      toDxColumns(GRID_COLUMNS, 'scroll').find((c) => c.dataField === 'id')!
        .width
    ).toBe(120);
  });
});

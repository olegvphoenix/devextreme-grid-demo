import {
  actionsColumn,
  DxColumnButton,
  GRID_COLUMNS,
  GRID_SUMMARY,
  HEADER_CELL_TEMPLATE,
  LABELS_CELL_TEMPLATE,
  LABELS_KEY_COLUMN,
  RowAction,
  STATUS_CELL_TEMPLATE,
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

  it('статус и ярлыки рисуются шаблонами, текст для копирования остаётся', () => {
    const status = byField('status');
    expect(status.cellTemplate).toBe(STATUS_CELL_TEMPLATE);
    expect(
      status.customizeText!.call(status, { value: 1, valueText: '1' })
    ).toBe('В работе');

    const labels = byField('labels');
    expect(labels.cellTemplate).toBe(LABELS_CELL_TEMPLATE);
    expect(labels.allowSorting).toBeFalse();
    expect(labels.allowGrouping).toBeFalse();
    expect(
      labels.customizeText!.call(labels, {
        value: ['срочно', 'брак'],
        valueText: '',
      })
    ).toBe('срочно, брак');
    expect(byField('plant').cellTemplate).toBeUndefined();
  });

  it('ширины задаются только в режиме прокрутки', () => {
    expect(byField('id').width).toBeUndefined();
    expect(
      toDxColumns(GRID_COLUMNS, 'scroll').find((c) => c.dataField === 'id')!
        .width
    ).toBe(120);
  });
});

/** Тип события кнопки берётся из типа бандла: модульный с ним не сравнивается (TS2321). */
type ButtonClick = Parameters<NonNullable<DxColumnButton['onClick']>>[0];

describe('actionsColumn', () => {
  let actions: Array<[RowAction, number]>;
  const column = () => actionsColumn((action, id) => actions.push([action, id]));
  const buttons = (): DxColumnButton[] =>
    column().buttons!.map((button) => button as DxColumnButton);
  const click = (button: DxColumnButton, key: number | undefined): void =>
    button.onClick!({
      row: key === undefined ? undefined : { key },
    } as unknown as ButtonClick);

  beforeEach(() => (actions = []));

  it('колонка кнопок: без поля, вне списка колонок, с фиксированной шириной, закреплена справа', () => {
    const actionsCol = column();
    expect(actionsCol.type).toBe('buttons');
    expect(actionsCol.dataField).toBeUndefined();
    expect(actionsCol.name).toBe('actions');
    expect(actionsCol.showInColumnChooser).toBeFalse();
    expect(actionsCol.allowExporting).toBeFalse();
    expect(actionsCol.allowResizing).toBeFalse();
    expect(actionsCol.width).toBe(100);
    expect(actionsCol.fixed).toBeTrue();
    expect(actionsCol.fixedPosition).toBe('right');
    expect(actionsCol.headerCellTemplate).toBeUndefined();
  });

  it('три кнопки с иконками и русскими подсказками', () => {
    expect(
      buttons().map((button) => [button.name, button.icon, button.hint])
    ).toEqual([
      ['open', 'find', 'Открыть'],
      ['start', 'runner', 'В работу'],
      ['close', 'check', 'Закрыть'],
    ]);
  });

  it('клик по кнопке отдаёт действие и id записи', () => {
    const [open, start, close] = buttons();
    click(open, 7);
    click(start, 8);
    click(close, 9);
    expect(actions).toEqual([
      ['open', 7],
      ['start', 8],
      ['close', 9],
    ]);
  });

  it('клик без строки ничего не делает', () => {
    click(buttons()[0], undefined);
    expect(actions).toEqual([]);
  });
});

describe('GRID_SUMMARY', () => {
  const describe_ = (items: Array<{ column?: string; summaryType?: string }>) =>
    items.map((item) => `${item.column ?? '*'}:${item.summaryType}`);

  it('агрегаты групп: число строк, суммы весов и количества, средние веса', () => {
    expect(describe_(GRID_SUMMARY.groupItems!)).toEqual([
      '*:count',
      'netWeight:sum',
      'netWeight:avg',
      'grossWeight:sum',
      'grossWeight:avg',
      'qty:sum',
    ]);
  });

  it('итоги по всему набору — те же агрегаты, число строк в колонке id', () => {
    expect(describe_(GRID_SUMMARY.totalItems!)).toEqual([
      'id:count',
      'netWeight:sum',
      'netWeight:avg',
      'grossWeight:sum',
      'grossWeight:avg',
      'qty:sum',
    ]);
  });

  it('подписи на русском, веса с одним знаком, целые без дробной части', () => {
    const all = [...GRID_SUMMARY.groupItems!, ...GRID_SUMMARY.totalItems!];
    all.forEach((item) => {
      expect(item.displayFormat).withContext(String(item.summaryType)).toMatch(
        /^(Строк|Всего строк|Сумма|Среднее): \{0\}$/
      );
      expect(item.valueFormat)
        .withContext(`${item.column}:${item.summaryType}`)
        .toBe(
          item.column === 'netWeight' || item.column === 'grossWeight'
            ? '#,##0.0'
            : '#,##0'
        );
    });
    GRID_SUMMARY.groupItems!.forEach((item) => {
      expect(item.alignByColumn === true).toBe(item.column !== undefined);
    });
  });
});

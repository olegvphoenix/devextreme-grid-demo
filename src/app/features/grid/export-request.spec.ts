import { DxGridColumnState } from './grid-state';
import {
  buildExportRequest,
  estimatePdfPages,
  ExportGrid,
  exportFileName,
  PDF_CONFIRM_ROWS,
} from './export-request';

interface StubColumn extends DxGridColumnState {
  caption?: string;
  allowExporting?: boolean;
}

/** Заглушка грида: состояние колонок и `columnOption` по полю. */
function gridOf(columns: StubColumn[]): ExportGrid {
  const byField = new Map(
    columns
      .filter((column) => column.dataField !== undefined)
      .map((column) => [column.dataField, column])
  );
  return {
    state: () => ({ columns: columns.map((column) => ({ ...column })) }),
    columnOption: (id: string | number, name?: string) => {
      const column = byField.get(String(id));
      if (column === undefined || name === undefined) {
        return undefined;
      }
      return column[name];
    },
  } as unknown as ExportGrid;
}

const plant: StubColumn = {
  dataField: 'plant',
  caption: 'Завод',
  visible: true,
  visibleIndex: 2,
};
const date: StubColumn = {
  dataField: 'date',
  caption: 'Дата',
  visible: true,
  visibleIndex: 0,
};
const qty: StubColumn = {
  dataField: 'qty',
  caption: 'Количество',
  visible: true,
  visibleIndex: 1,
};
const hidden: StubColumn = {
  dataField: 'batch',
  caption: 'Партия',
  visible: false,
  visibleIndex: 3,
};
const buttons: StubColumn = { name: 'actions', visible: true, visibleIndex: 4 };
const labelsKey: StubColumn = {
  dataField: 'labelsKey',
  visible: false,
  visibleIndex: 5,
};

describe('buildExportRequest', () => {
  it('видимые колонки идут в порядке visibleIndex с подписями', () => {
    const request = buildExportRequest(gridOf([plant, date, qty]), null);
    expect(request.columns).toEqual([
      { field: 'date', caption: 'Дата' },
      { field: 'qty', caption: 'Количество' },
      { field: 'plant', caption: 'Завод' },
    ]);
  });

  it('скрытые, служебные и запрещённые к экспорту колонки не попадают', () => {
    const noExport: StubColumn = {
      dataField: 'markingCode',
      caption: 'Код маркировки',
      visible: true,
      visibleIndex: 6,
      allowExporting: false,
    };
    const request = buildExportRequest(
      gridOf([hidden, buttons, labelsKey, date, noExport]),
      null
    );
    expect(request.columns).toEqual([{ field: 'date', caption: 'Дата' }]);
  });

  it('без подписи колонка получает своё поле', () => {
    const request = buildExportRequest(
      gridOf([{ dataField: 'ean13', visible: true, visibleIndex: 0 }]),
      null
    );
    expect(request.columns).toEqual([{ field: 'ean13', caption: 'ean13' }]);
  });

  it('сортировка — в порядке sortIndex, скрытая колонка тоже', () => {
    const request = buildExportRequest(
      gridOf([
        { ...plant, sortOrder: 'asc', sortIndex: 1 },
        { ...date, sortOrder: 'desc', sortIndex: 0 },
        { ...hidden, sortOrder: 'asc', sortIndex: 2 },
        qty,
      ]),
      null
    );
    expect(request.sort).toEqual([
      { selector: 'date', desc: true },
      { selector: 'plant', desc: false },
      { selector: 'batch', desc: false },
    ]);
  });

  it('группировка — в порядке groupIndex, группы не дублируются в сортировке', () => {
    const request = buildExportRequest(
      gridOf([
        { ...qty, sortOrder: 'desc', sortIndex: 0 },
        { ...plant, groupIndex: 1, sortOrder: 'desc', sortIndex: 1 },
        { ...date, groupIndex: 0, sortOrder: 'asc', sortIndex: 2 },
      ]),
      null
    );
    expect(request.group).toEqual([
      { selector: 'date', desc: false },
      { selector: 'plant', desc: true },
    ]);
    expect(request.sort).toEqual([{ selector: 'qty', desc: true }]);
  });

  it('сгруппированные колонки открывают список колонок: по ним упорядочены строки', () => {
    const request = buildExportRequest(
      gridOf([qty, { ...plant, groupIndex: 0 }, date]),
      null
    );
    expect(request.columns.map((column) => column.field)).toEqual([
      'plant',
      'date',
      'qty',
    ]);
  });

  it('без сортировки и группировки ключей sort и group нет', () => {
    const request = buildExportRequest(gridOf([date]), null);
    expect('sort' in request).toBeFalse();
    expect('group' in request).toBeFalse();
  });

  it('фильтр страницы передаётся как есть', () => {
    const filter: ['status', '=', number] = ['status', '=', 1];
    const passed: unknown = buildExportRequest(gridOf([date]), filter).filter;
    expect(passed).toBe(filter);
    expect(buildExportRequest(gridOf([date]), null).filter).toBeNull();
  });

  it('без состояния колонок список пуст', () => {
    const grid = {
      state: () => ({}),
      columnOption: () => undefined,
    } as unknown as ExportGrid;
    expect(buildExportRequest(grid, null).columns).toEqual([]);
  });
});

describe('estimatePdfPages', () => {
  it('45 строк на страницу, как у сервера; 1 000 000 строк — 22 223 страницы', () => {
    expect(estimatePdfPages(1000000)).toBe(22223);
    expect(estimatePdfPages(45)).toBe(1);
    expect(estimatePdfPages(46)).toBe(2);
  });

  it('пустой набор — одна страница', () => {
    expect(estimatePdfPages(0)).toBe(1);
  });

  it('подтверждение PDF — от 100 000 строк', () => {
    expect(PDF_CONFIRM_ROWS).toBe(100000);
  });
});

describe('exportFileName', () => {
  it('источник, вид и дата со временем в имени', () => {
    const now = new Date(2026, 10, 1, 14, 5, 9);
    expect(exportFileName('server', 'xlsx', now)).toBe(
      'server-export-2026-11-01_14-05-09.xlsx'
    );
    expect(exportFileName('grid', 'pdf', now)).toBe(
      'grid-export-2026-11-01_14-05-09.pdf'
    );
  });
});

import {
  CellSelection,
  gridSelection,
  isSelectableCell,
  selectionOptions,
} from './cell-selection';

describe('selectionOptions', () => {
  it('опции грида: выбор всех только на странице, иначе грид грузит весь набор', () => {
    expect(gridSelection('multi-checkbox')).toEqual({
      mode: 'multiple',
      showCheckBoxesMode: 'always',
      allowSelectAll: true,
      selectAllMode: 'page',
    });
    expect(gridSelection('cells').mode).toBe('none');
  });

  it('пять режимов', () => {
    expect(selectionOptions('none').mode).toBe('none');
    expect(selectionOptions('row').mode).toBe('single');
    expect(selectionOptions('multi-checkbox')).toEqual({
      mode: 'multiple',
      showCheckBoxesMode: 'always',
    });
    expect(selectionOptions('multi-plain')).toEqual({
      mode: 'multiple',
      showCheckBoxesMode: 'none',
    });
    expect(selectionOptions('cells').mode).toBe('none');
  });
});

describe('CellSelection', () => {
  const plain = { ctrl: false, shift: false };
  const ctrl = { ctrl: true, shift: false };
  const shift = { ctrl: false, shift: true };

  it('Shift выделяет прямоугольник', () => {
    const s = new CellSelection();
    const order = { rowKeys: [1, 2, 3], fields: ['a', 'b'] };
    s.click({ rowKey: 1, field: 'a' }, plain, order);
    s.click({ rowKey: 3, field: 'b' }, shift, order);
    expect(s.cells.length).toBe(6);
  });

  it('прямоугольник идёт по порядку строк и колонок независимо от направления', () => {
    const s = new CellSelection();
    const order = { rowKeys: [10, 20, 30], fields: ['a', 'b', 'c'] };
    s.click({ rowKey: 30, field: 'c' }, plain, order);
    s.click({ rowKey: 20, field: 'b' }, shift, order);
    expect(s.cells).toEqual([
      { rowKey: 20, field: 'b' },
      { rowKey: 20, field: 'c' },
      { rowKey: 30, field: 'b' },
      { rowKey: 30, field: 'c' },
    ]);
    expect(s.has({ rowKey: 10, field: 'a' })).toBeFalse();
    expect(s.has({ rowKey: 30, field: 'b' })).toBeTrue();
  });

  it('Ctrl переключает ячейку', () => {
    const s = new CellSelection();
    const order = { rowKeys: [1], fields: ['a', 'b'] };
    s.click({ rowKey: 1, field: 'a' }, plain, order);
    s.click({ rowKey: 1, field: 'b' }, ctrl, order);
    s.click({ rowKey: 1, field: 'a' }, ctrl, order);
    expect(s.cells).toEqual([{ rowKey: 1, field: 'b' }]);
  });

  it('клик без модификаторов сбрасывает выделение', () => {
    const s = new CellSelection();
    const order = { rowKeys: [1, 2], fields: ['a', 'b'] };
    s.click({ rowKey: 1, field: 'a' }, plain, order);
    s.click({ rowKey: 2, field: 'b' }, shift, order);
    expect(s.cells.length).toBe(4);
    s.click({ rowKey: 2, field: 'a' }, plain, order);
    expect(s.cells).toEqual([{ rowKey: 2, field: 'a' }]);
  });

  it('Shift без опорной ячейки работает как обычный клик', () => {
    const s = new CellSelection();
    const order = { rowKeys: [1, 2], fields: ['a'] };
    s.click({ rowKey: 2, field: 'a' }, shift, order);
    expect(s.cells).toEqual([{ rowKey: 2, field: 'a' }]);
  });

  it('Shift от опорной ячейки, которой нет в порядке, работает как обычный клик', () => {
    const s = new CellSelection();
    s.click({ rowKey: 1, field: 'a' }, plain, { rowKeys: [1], fields: ['a'] });
    s.click(
      { rowKey: 7, field: 'a' },
      shift,
      { rowKeys: [7, 8], fields: ['a'] }
    );
    expect(s.cells).toEqual([{ rowKey: 7, field: 'a' }]);
  });

  it('Ctrl+Shift добавляет прямоугольник к выделению', () => {
    const s = new CellSelection();
    const order = { rowKeys: [1, 2, 3], fields: ['a', 'b'] };
    s.click({ rowKey: 1, field: 'a' }, plain, order);
    s.click({ rowKey: 3, field: 'a' }, ctrl, order);
    s.click({ rowKey: 3, field: 'b' }, { ctrl: true, shift: true }, order);
    expect(s.cells).toEqual([
      { rowKey: 1, field: 'a' },
      { rowKey: 3, field: 'a' },
      { rowKey: 3, field: 'b' },
    ]);
  });

  it('clear очищает выделение и опорную ячейку', () => {
    const s = new CellSelection();
    const order = { rowKeys: [1, 2], fields: ['a'] };
    s.click({ rowKey: 1, field: 'a' }, plain, order);
    s.clear();
    expect(s.cells).toEqual([]);
    s.click({ rowKey: 2, field: 'a' }, shift, order);
    expect(s.cells).toEqual([{ rowKey: 2, field: 'a' }]);
  });

  it('cells отдаёт копию, count — число ячеек', () => {
    const s = new CellSelection();
    expect(s.count).toBe(0);
    s.click({ rowKey: 1, field: 'a' }, plain, { rowKeys: [1], fields: ['a'] });
    s.cells.length = 0;
    expect(s.cells.length).toBe(1);
    expect(s.count).toBe(1);
  });
});

describe('isSelectableCell', () => {
  it('ячейка данных в колонке с полем выделяется', () => {
    expect(isSelectableCell('data', { dataField: 'plant' })).toBeTrue();
  });

  it('заголовок, группа и служебные колонки не выделяются', () => {
    expect(isSelectableCell('header', { dataField: 'plant' })).toBeFalse();
    expect(isSelectableCell('group', { dataField: 'plant' })).toBeFalse();
    expect(isSelectableCell('data', { type: 'buttons' })).toBeFalse();
    expect(
      isSelectableCell('data', { type: 'selection', dataField: undefined })
    ).toBeFalse();
    expect(isSelectableCell('data', {})).toBeFalse();
  });
});

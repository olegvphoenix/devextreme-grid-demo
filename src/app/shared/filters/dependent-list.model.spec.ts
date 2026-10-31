import { FilterValue } from '../../models/column-filter.model';
import { DistinctResult } from '../../models/distinct.model';
import { DependentListModel, needsReload } from './dependent-list.model';

const response = (values: FilterValue[], truncated = false): DistinctResult => ({
  items: values.map((v) => ({ value: v, text: String(v), count: 1 })),
  totalCount: values.length,
  truncated,
});

describe('DependentListModel', () => {
  it('пустая модель', () => {
    const m = new DependentListModel();
    expect(m.items).toEqual([]);
    expect(m.truncated).toBeFalse();
    expect(m.totalCount).toBe(0);
    expect(m.allSelected).toBeFalse();
    expect(m.toValues()).toBeUndefined();
  });

  it('nextRequestId растёт', () => {
    const m = new DependentListModel();
    const first = m.nextRequestId();
    expect(m.nextRequestId()).toBeGreaterThan(first);
  });

  it('строит элементы из ответа', () => {
    const m = new DependentListModel();
    m.applyResponse(m.nextRequestId(), {
      items: [{ value: 1, text: 'Один', count: 7 }],
      totalCount: 1,
      truncated: false,
    });
    expect(m.items).toEqual([{ value: 1, text: 'Один', count: 7 }]);
    expect(m.totalCount).toBe(1);
    expect(m.truncated).toBeFalse();
  });

  it('устаревший ответ игнорируется', () => {
    const m = new DependentListModel();
    const old = m.nextRequestId();
    const fresh = m.nextRequestId();
    m.applyResponse(fresh, response([1]));
    m.applyResponse(old, response([2]));
    expect(m.items.map((i) => i.value)).toEqual([1]);
  });

  it('выбор сохраняется, если значение осталось', () => {
    const m = new DependentListModel([1, 2]);
    m.applyResponse(m.nextRequestId(), response([1, 3]));
    expect(m.isSelected(1)).toBeTrue();
  });

  it('значение, исчезнувшее из полного списка, отбрасывается', () => {
    const m = new DependentListModel([1, 2]);
    m.applyResponse(m.nextRequestId(), response([1, 3]));
    expect(m.toValues()).toEqual([1]);
  });

  it('при усечённом списке скрытые значения сохраняются', () => {
    const m = new DependentListModel([1, 2]);
    m.applyResponse(m.nextRequestId(), response([1], true));
    expect(m.toValues()).toEqual([1, 2]);
  });

  it('toggle включает и выключает значение', () => {
    const m = new DependentListModel();
    m.applyResponse(m.nextRequestId(), response([1, 2]));
    m.toggle(1);
    expect(m.isSelected(1)).toBeTrue();
    expect(m.toValues()).toEqual([1]);
    m.toggle(1);
    expect(m.isSelected(1)).toBeFalse();
    expect(m.toValues()).toBeUndefined();
  });

  it('число и строка — разные значения', () => {
    const m = new DependentListModel([1]);
    expect(m.isSelected('1')).toBeFalse();
  });

  it('выбрано всё -> нет фильтра при полном списке', () => {
    const m = new DependentListModel();
    m.applyResponse(m.nextRequestId(), response([1, 2]));
    m.selectAll();
    expect(m.toValues()).toBeUndefined();
  });

  it('выбрано всё -> allSelected и подпись «Выбрать всё»', () => {
    const m = new DependentListModel();
    m.applyResponse(m.nextRequestId(), response([1, 2]));
    expect(m.allSelected).toBeFalse();
    m.selectAll();
    expect(m.allSelected).toBeTrue();
    expect(m.selectAllLabel).toBe('Выбрать всё');
  });

  it('выбрано всё при усечении -> явный список и другая подпись', () => {
    const m = new DependentListModel();
    m.applyResponse(m.nextRequestId(), response([1, 2], true));
    m.selectAll();
    expect(m.toValues()).toEqual([1, 2]);
    expect(m.selectAllLabel).toBe('Выбрать показанные (2)');
  });

  it('clear снимает выбор, включая скрытые значения', () => {
    const m = new DependentListModel([1, 9]);
    m.applyResponse(m.nextRequestId(), response([1], true));
    m.clear();
    expect(m.isSelected(1)).toBeFalse();
    expect(m.toValues()).toBeUndefined();
  });

  it('частичный выбор полного списка -> явный список', () => {
    const m = new DependentListModel();
    m.applyResponse(m.nextRequestId(), response([1, 2, 3]));
    m.toggle(1);
    m.toggle(3);
    expect(m.toValues()).toEqual([1, 3]);
  });
});

describe('needsReload', () => {
  it('needsReload: чужая колонка да, своя нет', () => {
    expect(needsReload({}, { b: { values: [1] } }, 'a')).toBeTrue();
    expect(needsReload({}, { a: { values: [1] } }, 'a')).toBeFalse();
  });

  it('одинаковые чужие фильтры -> нет', () => {
    expect(
      needsReload(
        { b: { values: [1] }, a: { values: [1] } },
        { b: { values: [1] }, a: { values: [2] } },
        'a'
      )
    ).toBeFalse();
  });

  it('снятие чужого фильтра -> да', () => {
    expect(needsReload({ b: { values: [1] } }, {}, 'a')).toBeTrue();
  });

  it('пустое состояние чужой колонки равно её отсутствию', () => {
    expect(needsReload({ b: {} }, {}, 'a')).toBeFalse();
    expect(needsReload({}, { b: { values: [] } }, 'a')).toBeFalse();
  });

  it('смена только texts чужой колонки -> нет', () => {
    expect(
      needsReload(
        { b: { values: [1], texts: { '1': 'Один' } } },
        { b: { values: [1], texts: { '1': 'One' } } },
        'a'
      )
    ).toBeFalse();
  });

  it('смена диапазона чужой колонки -> да', () => {
    expect(
      needsReload({ b: { from: 1 } }, { b: { from: 1, to: 2 } }, 'a')
    ).toBeTrue();
  });
});

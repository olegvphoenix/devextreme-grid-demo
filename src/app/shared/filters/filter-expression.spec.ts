import {
  ColumnFilterState,
  GridFilterState,
} from '../../models/column-filter.model';
import {
  buildColumnExpression,
  buildFilterExpression,
  isColumnFilterActive,
} from './filter-expression';

/** Результат расширен до unknown: Expected<T> Jasmine не раскрывается над рекурсивным FilterExpression. */
const build = (state: GridFilterState, excludeField?: string): unknown =>
  buildFilterExpression(state, excludeField);
const column = (field: string, s: ColumnFilterState): unknown =>
  buildColumnExpression(field, s);

describe('buildFilterExpression', () => {
  it('пустое состояние -> null', () =>
    expect(build({})).toBeNull());

  it('одно значение', () =>
    expect(build({ a: { values: [1] } })).toEqual([
      'a',
      '=',
      1,
    ]));

  it('несколько значений -> or', () =>
    expect(build({ a: { values: [1, 2] } })).toEqual([
      ['a', '=', 1],
      'or',
      ['a', '=', 2],
    ]));

  it('много значений -> плоская цепочка or без вложенности', () =>
    expect(build({ a: { values: [1, 2, 3] } })).toEqual([
      ['a', '=', 1],
      'or',
      ['a', '=', 2],
      'or',
      ['a', '=', 3],
    ]));

  it('диапазон -> >= и <=, без between', () =>
    expect(build({ a: { from: 1, to: 2 } })).toEqual([
      ['a', '>=', 1],
      'and',
      ['a', '<=', 2],
    ]));

  it('только с -> одно условие >=', () =>
    expect(build({ a: { from: 1 } })).toEqual(['a', '>=', 1]));

  it('только по -> одно условие <=', () =>
    expect(build({ a: { to: 2 } })).toEqual(['a', '<=', 2]));

  it('значения и диапазон одной колонки -> and', () =>
    expect(
      build({ a: { values: [1, 2], from: 0, to: 5 } })
    ).toEqual([
      [['a', '=', 1], 'or', ['a', '=', 2]],
      'and',
      [['a', '>=', 0], 'and', ['a', '<=', 5]],
    ]));

  it('несколько колонок -> and', () =>
    expect(
      build({ a: { values: [1] }, b: { values: [2] } })
    ).toEqual([['a', '=', 1], 'and', ['b', '=', 2]]));

  it('три колонки -> плоская цепочка and', () =>
    expect(
      build({
        a: { values: [1] },
        b: { values: [2] },
        c: { from: 3 },
      })
    ).toEqual([['a', '=', 1], 'and', ['b', '=', 2], 'and', ['c', '>=', 3]]));

  it('excludeField убирает колонку', () =>
    expect(
      build({ a: { values: [1] }, b: { values: [2] } }, 'a')
    ).toEqual(['b', '=', 2]));

  it('excludeField убирает единственную колонку -> null', () =>
    expect(build({ a: { values: [1] } }, 'a')).toBeNull());

  it('пустые состояния колонок -> null', () =>
    expect(
      build({ a: {}, b: { values: [] }, c: { from: null } })
    ).toBeNull());

  it('не мутирует вход', () => {
    const s = { a: { values: [1, 2] } };
    build(s);
    expect(s).toEqual({ a: { values: [1, 2] } });
  });

  it('даты передаются строками yyyy-MM-dd как есть', () =>
    expect(
      build({
        date: { from: '2021-01-01', to: '2021-12-31' },
      })
    ).toEqual([
      ['date', '>=', '2021-01-01'],
      'and',
      ['date', '<=', '2021-12-31'],
    ]));
});

describe('buildColumnExpression', () => {
  it('ярлыки ищутся contains по labelsKey', () =>
    expect(column('labels', { values: ['а'] })).toEqual([
      'labelsKey',
      'contains',
      '|а|',
    ]));

  it('несколько ярлыков -> or из contains', () =>
    expect(column('labels', { values: ['а', 'б'] })).toEqual([
      ['labelsKey', 'contains', '|а|'],
      'or',
      ['labelsKey', 'contains', '|б|'],
    ]));

  it('пустое состояние колонки -> null', () =>
    expect(column('a', {})).toBeNull());
});

describe('isColumnFilterActive', () => {
  it('undefined и пустое состояние неактивны', () => {
    expect(isColumnFilterActive(undefined)).toBeFalse();
    expect(isColumnFilterActive({})).toBeFalse();
    expect(isColumnFilterActive({ values: [] })).toBeFalse();
    expect(isColumnFilterActive({ from: null, to: null })).toBeFalse();
  });

  it('значения или граница делают фильтр активным', () => {
    expect(isColumnFilterActive({ values: [1] })).toBeTrue();
    expect(isColumnFilterActive({ from: 0 })).toBeTrue();
    expect(isColumnFilterActive({ to: '2021-01-01' })).toBeTrue();
  });

  it('только texts не делает фильтр активным', () =>
    expect(isColumnFilterActive({ texts: { '1': 'Один' } })).toBeFalse());
});

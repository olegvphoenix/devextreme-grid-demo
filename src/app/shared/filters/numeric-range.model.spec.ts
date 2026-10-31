import { NumericRangeModel } from './numeric-range.model';

describe('NumericRangeModel', () => {
  const make = () => new NumericRangeModel(0, 100);

  it('только с -> по = max', () => {
    const m = make();
    m.setFrom(10);
    expect(m.to).toBe(100);
  });

  it('только по -> с = min', () => {
    const m = make();
    m.setTo(10);
    expect(m.from).toBe(0);
  });

  it('fromMax = to, toMin = from', () => {
    const m = make();
    m.setFrom(10);
    m.setTo(20);
    expect(m.fromMax).toBe(20);
    expect(m.toMin).toBe(10);
  });

  it('без значений границы = min/max', () => {
    const m = make();
    expect(m.fromMax).toBe(100);
    expect(m.toMin).toBe(0);
  });

  it('зажимает вне диапазона', () => {
    const m = make();
    m.setFrom(-5);
    expect(m.from).toBe(0);
  });

  it('зажимает по выше max', () => {
    const m = make();
    m.setTo(500);
    expect(m.to).toBe(100);
  });

  it('с позже по -> по приравнивается', () => {
    const m = make();
    m.setFrom(10);
    m.setTo(50);
    m.setFrom(60);
    expect(m.to).toBe(60);
  });

  it('по раньше с -> с приравнивается', () => {
    const m = make();
    m.setFrom(50);
    m.setTo(60);
    m.setTo(10);
    expect(m.from).toBe(10);
  });

  it('очистка убирает автоподставленное', () => {
    const m = make();
    m.setFrom(10);
    m.setFrom(null);
    expect(m.to).toBeNull();
  });

  it('очистка не убирает введённое вручную', () => {
    const m = make();
    m.setFrom(10);
    m.setTo(20);
    m.setFrom(null);
    expect(m.to).toBe(20);
  });

  it('полный охват -> нет фильтра', () => {
    const m = make();
    m.setFrom(0);
    m.setTo(100);
    expect(m.toState()).toEqual({});
  });

  it('ноль как граница не теряется', () => {
    const m = new NumericRangeModel(-10, 10);
    m.setFrom(0);
    expect(m.from).toBe(0);
    expect(m.toState()).toEqual({ from: 0 });
  });

  it('дробные значения сравниваются как числа', () => {
    const m = make();
    m.setFrom(9.5);
    m.setTo(10.25);
    expect(m.toState()).toEqual({ from: 9.5, to: 10.25 });
  });

  describe('fromState', () => {
    it('восстанавливает границы и автоподстановку', () => {
      const m = NumericRangeModel.fromState(0, 100, { to: 20 });
      expect(m.from).toBe(0);
      expect(m.to).toBe(20);
      expect(m.toState()).toEqual({ to: 20 });
    });

    it('строковые значения в числовом состоянии игнорируются', () => {
      const m = NumericRangeModel.fromState(0, 100, { from: '2021-01-01' });
      expect(m.from).toBeNull();
    });
  });
});

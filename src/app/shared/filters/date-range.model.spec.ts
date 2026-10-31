import { DateRangeModel } from './date-range.model';

describe('DateRangeModel', () => {
  const make = () => new DateRangeModel('2020-02-01', '2026-10-31');

  it('только с -> по = max', () => {
    const m = make();
    m.setFrom('2021-01-01');
    expect(m.to).toBe('2026-10-31');
  });

  it('только по -> с = min', () => {
    const m = make();
    m.setTo('2021-01-01');
    expect(m.from).toBe('2020-02-01');
  });

  it('fromMax = to, toMin = from', () => {
    const m = make();
    m.setFrom('2021-01-01');
    m.setTo('2022-01-01');
    expect(m.fromMax).toBe('2022-01-01');
    expect(m.toMin).toBe('2021-01-01');
  });

  it('без значений границы = min/max', () => {
    const m = make();
    expect(m.fromMax).toBe('2026-10-31');
    expect(m.toMin).toBe('2020-02-01');
  });

  it('зажимает вне диапазона', () => {
    const m = make();
    m.setFrom('2019-01-01');
    expect(m.from).toBe('2020-02-01');
  });

  it('зажимает по выше max', () => {
    const m = make();
    m.setTo('2030-01-01');
    expect(m.to).toBe('2026-10-31');
  });

  it('с позже по -> по приравнивается', () => {
    const m = make();
    m.setFrom('2021-01-01');
    m.setTo('2021-06-01');
    m.setFrom('2022-01-01');
    expect(m.to).toBe('2022-01-01');
  });

  it('по раньше с -> с приравнивается', () => {
    const m = make();
    m.setFrom('2021-06-01');
    m.setTo('2021-07-01');
    m.setTo('2021-01-01');
    expect(m.from).toBe('2021-01-01');
  });

  it('очистка убирает автоподставленное', () => {
    const m = make();
    m.setFrom('2021-01-01');
    m.setFrom(null);
    expect(m.to).toBeNull();
  });

  it('очистка по убирает автоподставленное с', () => {
    const m = make();
    m.setTo('2021-01-01');
    m.setTo(null);
    expect(m.from).toBeNull();
  });

  it('очистка не убирает введённое вручную', () => {
    const m = make();
    m.setFrom('2021-01-01');
    m.setTo('2022-01-01');
    m.setFrom(null);
    expect(m.to).toBe('2022-01-01');
  });

  it('полный охват -> нет фильтра', () => {
    const m = make();
    m.setFrom('2020-02-01');
    m.setTo('2026-10-31');
    expect(m.toState()).toEqual({});
  });

  it('пустая модель -> нет фильтра', () => expect(make().toState()).toEqual({}));

  it('строки сравниваются без Date', () => {
    const m = make();
    m.setFrom('2021-01-01');
    expect(m.toState().from).toBe('2021-01-01');
  });

  it('автоподставленная граница, равная пределу, в состояние не попадает', () => {
    const m = make();
    m.setFrom('2021-01-01');
    expect(m.toState()).toEqual({ from: '2021-01-01' });
  });

  it('обе границы внутри диапазона попадают в состояние', () => {
    const m = make();
    m.setFrom('2021-01-01');
    m.setTo('2022-01-01');
    expect(m.toState()).toEqual({ from: '2021-01-01', to: '2022-01-01' });
  });

  describe('fromState', () => {
    it('без состояния -> пустая модель', () => {
      const m = DateRangeModel.fromState('2020-02-01', '2026-10-31');
      expect(m.from).toBeNull();
      expect(m.to).toBeNull();
    });

    it('восстанавливает границы и автоподстановку', () => {
      const m = DateRangeModel.fromState('2020-02-01', '2026-10-31', {
        from: '2021-01-01',
      });
      expect(m.from).toBe('2021-01-01');
      expect(m.to).toBe('2026-10-31');
      expect(m.toState()).toEqual({ from: '2021-01-01' });
    });

    it('восстанавливает обе границы', () => {
      const m = DateRangeModel.fromState('2020-02-01', '2026-10-31', {
        from: '2021-01-01',
        to: '2022-01-01',
      });
      expect(m.toState()).toEqual({ from: '2021-01-01', to: '2022-01-01' });
    });

    it('числовые значения в состоянии даты игнорируются', () => {
      const m = DateRangeModel.fromState('2020-02-01', '2026-10-31', {
        from: 5,
      });
      expect(m.from).toBeNull();
    });
  });
});

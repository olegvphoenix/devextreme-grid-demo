import {
  ColumnFilterState,
  FilterValue,
} from '../../models/column-filter.model';

/**
 * Диапазон «с / по» с автоподстановкой: заполнено одно поле — второе
 * подставляется границей; значения зажимаются в [min, max]; «с» не может
 * быть позже «по» — второе поле приравнивается к изменённому. Поле помнит,
 * введено ли оно вручную: очистка убирает автоподставленную пару, но не
 * введённое вручную. Сравнение через `<`/`>` — строки `yyyy-MM-dd`
 * сравниваются лексикографически, без `Date`.
 */
export abstract class RangeModel<T extends FilterValue> {
  from: T | null = null;
  to: T | null = null;

  private fromManual = false;
  private toManual = false;

  constructor(public readonly min: T, public readonly max: T) {}

  setFrom(v: T | null): void {
    if (v === null) {
      this.from = null;
      this.fromManual = false;
      if (!this.toManual) {
        this.to = null;
      }
      return;
    }
    this.from = this.clamp(v);
    this.fromManual = true;
    if (this.to === null) {
      this.to = this.max;
    } else if (this.to < this.from) {
      this.to = this.from;
    }
  }

  setTo(v: T | null): void {
    if (v === null) {
      this.to = null;
      this.toManual = false;
      if (!this.fromManual) {
        this.from = null;
      }
      return;
    }
    this.to = this.clamp(v);
    this.toManual = true;
    if (this.from === null) {
      this.from = this.min;
    } else if (this.from > this.to) {
      this.from = this.to;
    }
  }

  /** Граница, равная пределу, не ограничивает ничего и в состояние не попадает. */
  toState(): Pick<ColumnFilterState, 'from' | 'to'> {
    const state: Pick<ColumnFilterState, 'from' | 'to'> = {};
    if (this.from !== null && this.from !== this.min) {
      state.from = this.from;
    }
    if (this.to !== null && this.to !== this.max) {
      state.to = this.to;
    }
    return state;
  }

  protected restore(s: ColumnFilterState | undefined): this {
    if (s === undefined) {
      return this;
    }
    const from = this.pick(s.from);
    const to = this.pick(s.to);
    if (from !== null) {
      this.setFrom(from);
    }
    if (to !== null) {
      this.setTo(to);
    }
    return this;
  }

  /** Значение состояния своего типа, иначе `null`: состояние другого типа колонки игнорируется. */
  protected abstract pick(value: FilterValue | null | undefined): T | null;

  private clamp(v: T): T {
    if (v < this.min) {
      return this.min;
    }
    if (v > this.max) {
      return this.max;
    }
    return v;
  }
}

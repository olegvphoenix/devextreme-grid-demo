import {
  ColumnFilterState,
  FilterValue,
} from '../../models/column-filter.model';
import { RangeModel } from './range.model';

/** Даты — строки `yyyy-MM-dd`, сравниваются как строки. */
export class DateRangeModel extends RangeModel<string> {
  static fromState(
    min: string,
    max: string,
    s?: ColumnFilterState
  ): DateRangeModel {
    return new DateRangeModel(min, max).restore(s);
  }

  protected pick(value: FilterValue | null | undefined): string | null {
    return typeof value === 'string' ? value : null;
  }
}

import {
  ColumnFilterState,
  FilterValue,
} from '../../models/column-filter.model';
import { RangeModel } from './range.model';

export class NumericRangeModel extends RangeModel<number> {
  static fromState(
    min: number,
    max: number,
    s?: ColumnFilterState
  ): NumericRangeModel {
    return new NumericRangeModel(min, max).restore(s);
  }

  protected pick(value: FilterValue | null | undefined): number | null {
    return typeof value === 'number' ? value : null;
  }
}

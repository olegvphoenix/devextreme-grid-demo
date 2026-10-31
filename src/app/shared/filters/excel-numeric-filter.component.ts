import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
} from '@angular/core';
import { ValueChangedEvent } from 'devextreme/ui/number_box';

import { ColumnFilterState } from '../../models/column-filter.model';
import { dxEditorValue } from './dx-editor-value';
import { NumericRangeModel } from './numeric-range.model';

@Component({
  selector: 'app-excel-numeric-filter',
  templateUrl: './excel-numeric-filter.component.html',
  styles: [':host { display: flex; gap: 8px; }'],
})
export class ExcelNumericFilterComponent implements OnChanges {
  @Input() min = 0;
  @Input() max = 0;
  @Input() state?: ColumnFilterState;
  @Input() format?: string;
  @Output() rangeChange = new EventEmitter<
    Pick<ColumnFilterState, 'from' | 'to'>
  >();

  model = new NumericRangeModel(0, 0);

  get fromValue(): number {
    return dxEditorValue(this.model.from);
  }

  get toValue(): number {
    return dxEditorValue(this.model.to);
  }

  ngOnChanges(): void {
    this.model = NumericRangeModel.fromState(this.min, this.max, this.state);
  }

  /**
   * Привязка `[value]` возвращает своё же значение событием — оно пропускается.
   * Зажатое моделью значение возвращается в редактор явно: привязка этого не
   * сделает, если значение модели не изменилось.
   */
  onFromChanged(e: ValueChangedEvent): void {
    const next = toNumber(e.value);
    if (next === this.model.from) {
      return;
    }
    this.model.setFrom(next);
    if (this.model.from !== null && this.model.from !== next) {
      e.component.option('value', this.model.from);
    }
    this.rangeChange.emit(this.model.toState());
  }

  onToChanged(e: ValueChangedEvent): void {
    const next = toNumber(e.value);
    if (next === this.model.to) {
      return;
    }
    this.model.setTo(next);
    if (this.model.to !== null && this.model.to !== next) {
      e.component.option('value', this.model.to);
    }
    this.rangeChange.emit(this.model.toState());
  }
}

/** Значение dx-number-box: число, при очистке — null. */
function toNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

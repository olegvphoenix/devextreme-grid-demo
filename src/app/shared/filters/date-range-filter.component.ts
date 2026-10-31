import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
} from '@angular/core';
import { formatDate } from '@angular/common';
import { ValueChangedEvent } from 'devextreme/ui/date_box';

import { ColumnFilterState } from '../../models/column-filter.model';
import { DATE_FORMAT } from '../date-format';
import { DateRangeModel } from './date-range.model';
import { dxEditorValue } from './dx-editor-value';

export const DATE_SERIALIZATION_FORMAT = 'yyyy-MM-dd';

/** Значение dx-date-box: при `dateSerializationFormat` — строка, при очистке — null. */
export function toDateString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value === '' ? null : value;
  }
  if (value instanceof Date || typeof value === 'number') {
    return formatDate(value, DATE_SERIALIZATION_FORMAT, 'en-US');
  }
  return null;
}

@Component({
  selector: 'app-date-range-filter',
  templateUrl: './date-range-filter.component.html',
  styles: [':host { display: flex; gap: 8px; }'],
})
export class DateRangeFilterComponent implements OnChanges {
  @Input() min = '';
  @Input() max = '';
  @Input() state?: ColumnFilterState;
  @Output() rangeChange = new EventEmitter<
    Pick<ColumnFilterState, 'from' | 'to'>
  >();

  readonly displayFormat = DATE_FORMAT;
  readonly serializationFormat = DATE_SERIALIZATION_FORMAT;
  model = new DateRangeModel('', '');

  get fromValue(): string {
    return dxEditorValue(this.model.from);
  }

  get toValue(): string {
    return dxEditorValue(this.model.to);
  }

  ngOnChanges(): void {
    this.model = DateRangeModel.fromState(this.min, this.max, this.state);
  }

  /**
   * Привязка `[value]` возвращает своё же значение событием — оно пропускается.
   * Зажатое моделью значение возвращается в редактор явно: привязка этого не
   * сделает, если значение модели не изменилось.
   */
  onFromChanged(e: ValueChangedEvent): void {
    const next = toDateString(e.value);
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
    const next = toDateString(e.value);
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

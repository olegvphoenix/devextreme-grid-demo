import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrowserTransferStateModule } from '@angular/platform-browser';
import { DxNumberBoxComponent } from 'devextreme-angular/ui/number-box';

import { ColumnFilterState } from '../../models/column-filter.model';
import { FiltersModule } from './filters.module';

@Component({
  template: `<app-excel-numeric-filter
    [min]="min"
    [max]="max"
    [state]="state"
    [format]="format"
    (rangeChange)="emitted.push($event)"
  ></app-excel-numeric-filter>`,
})
class HostComponent {
  min = 1;
  max = 100;
  state?: ColumnFilterState;
  format?: string;
  emitted: Array<Pick<ColumnFilterState, 'from' | 'to'>> = [];
}

describe('ExcelNumericFilterComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const box = (testId: string): DxNumberBoxComponent =>
    fixture.debugElement.query(By.css(`[data-testid="${testId}"]`))
      .componentInstance;
  const from = (): DxNumberBoxComponent => box('numeric-range-from');
  const to = (): DxNumberBoxComponent => box('numeric-range-to');

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [BrowserTransferStateModule, FiltersModule],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  it('выдаёт автоподставленное значение и подтягивает «с» к «по»', () => {
    fixture.detectChanges();
    from().instance.option('value', 10);
    fixture.detectChanges();
    expect(host.emitted).toEqual([{ from: 10 }]);
    expect(to().instance.option('value')).toBe(100);
    expect(to().instance.option('min')).toBe(10);

    to().instance.option('value', 5);
    fixture.detectChanges();
    expect(host.emitted[1]).toEqual({ from: 5, to: 5 });
    expect(from().instance.option('value')).toBe(5);
  });

  it('значение за границей зажимается', () => {
    fixture.detectChanges();
    to().instance.option('value', 7);
    fixture.detectChanges();
    expect(host.emitted).toEqual([{ to: 7 }]);
    expect(from().instance.option('value')).toBe(1);
    from().instance.option('value', 0);
    fixture.detectChanges();
    expect(host.emitted[1]).toEqual({ to: 7 });
    expect(from().instance.option('value')).toBe(1);
  });

  it('восстанавливает диапазон из state и передаёт format', () => {
    host.state = { from: 10, to: 20 };
    host.format = '#,##0.0';
    fixture.detectChanges();
    expect(from().instance.option('value')).toBe(10);
    expect(to().instance.option('value')).toBe(20);
    expect(from().instance.option('format')).toBe('#,##0.0');
    expect(to().instance.option('format')).toBe('#,##0.0');
    expect(host.emitted).toEqual([]);
  });
});

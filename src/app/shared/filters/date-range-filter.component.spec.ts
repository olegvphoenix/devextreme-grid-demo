import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrowserTransferStateModule } from '@angular/platform-browser';
import { DxDateBoxComponent } from 'devextreme-angular/ui/date-box';

import { ColumnFilterState } from '../../models/column-filter.model';
import { FiltersModule } from './filters.module';

@Component({
  template: `<app-date-range-filter
    [min]="min"
    [max]="max"
    [state]="state"
    (rangeChange)="emitted.push($event)"
  ></app-date-range-filter>`,
})
class HostComponent {
  min = '2020-02-01';
  max = '2026-10-31';
  state?: ColumnFilterState;
  emitted: Array<Pick<ColumnFilterState, 'from' | 'to'>> = [];
}

describe('DateRangeFilterComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const box = (testId: string): DxDateBoxComponent =>
    fixture.debugElement.query(By.css(`[data-testid="${testId}"]`))
      .componentInstance;
  const from = (): DxDateBoxComponent => box('date-range-from');
  const to = (): DxDateBoxComponent => box('date-range-to');

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [BrowserTransferStateModule, FiltersModule],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  it('DateRangeFilterComponent выдаёт автоподставленное значение', () => {
    fixture.detectChanges();
    from().instance.option('value', '2021-05-01');
    fixture.detectChanges();
    expect(host.emitted).toEqual([{ from: '2021-05-01' }]);
    expect(to().instance.option('value')).toBe('2026-10-31');

    to().instance.option('value', '2021-03-01');
    fixture.detectChanges();
    expect(host.emitted[1]).toEqual({ from: '2021-03-01', to: '2021-03-01' });
    expect(from().instance.option('value')).toBe('2021-03-01');
  });

  it('«по» раньше «с», набранное с клавиатуры, подтягивает «с»', () => {
    fixture.detectChanges();
    from().instance.option('value', '2021-05-01');
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="date-range-to"] input.dx-texteditor-input'
    );
    input.value = '01.03.2021';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(to().instance.option('isValid')).toBeTrue();
    expect(host.emitted[1]).toEqual({ from: '2021-03-01', to: '2021-03-01' });
    expect(from().instance.option('value')).toBe('2021-03-01');
  });

  it('очистка «с» убирает автоподставленное «по»', () => {
    fixture.detectChanges();
    from().instance.option('value', '2021-05-01');
    fixture.detectChanges();
    from().instance.reset();
    fixture.detectChanges();
    expect(host.emitted[1]).toEqual({});
    expect(to().instance.option('value')).toBeNull();
    expect(to().instance.option('min')).toBe('2020-02-01');
  });

  it('восстанавливает диапазон из state, поля ограничены границами набора', () => {
    host.state = { from: '2021-01-01', to: '2021-12-31' };
    fixture.detectChanges();
    expect(from().instance.option('value')).toBe('2021-01-01');
    expect(to().instance.option('value')).toBe('2021-12-31');
    expect(from().instance.option('min')).toBe('2020-02-01');
    expect(from().instance.option('max')).toBe('2026-10-31');
    expect(to().instance.option('min')).toBe('2020-02-01');
    expect(to().instance.option('max')).toBe('2026-10-31');
    expect(host.emitted).toEqual([]);
  });

  it('показывает dd.MM.yyyy, сериализует yyyy-MM-dd', () => {
    fixture.detectChanges();
    from().instance.option('value', '2021-05-01');
    fixture.detectChanges();
    expect(from().instance.option('displayFormat')).toBe('dd.MM.yyyy');
    expect(from().instance.option('dateSerializationFormat')).toBe('yyyy-MM-dd');
    expect(from().instance.option('type')).toBe('date');
    const input: HTMLInputElement = fixture.nativeElement.querySelector(
      '[data-testid="date-range-from"] input.dx-texteditor-input'
    );
    expect(input.value).toBe('01.05.2021');
  });
});

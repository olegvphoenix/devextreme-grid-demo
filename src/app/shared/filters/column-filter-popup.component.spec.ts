import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrowserTransferStateModule } from '@angular/platform-browser';
import { DxCheckBoxComponent } from 'devextreme-angular/ui/check-box';
import { DxNumberBoxComponent } from 'devextreme-angular/ui/number-box';

import { DataService } from '../../core/data.service';
import {
  FilterCondition,
  GridFilterState,
} from '../../models/column-filter.model';
import {
  ColumnFilterApply,
  ColumnFilterPopupComponent,
  ColumnKind,
  FilterColumn,
} from './column-filter-popup.component';
import { DateRangeFilterComponent } from './date-range-filter.component';
import { DependentMultiCheckboxFilterComponent } from './dependent-multi-checkbox-filter.component';
import { ExcelNumericFilterComponent } from './excel-numeric-filter.component';
import { FiltersModule } from './filters.module';
import { DataServiceStub, items } from './testing/data-service.stub';

@Component({
  template: `<button #anchor type="button">Фильтр</button>
    <app-column-filter-popup
      [column]="column"
      [target]="anchor"
      [state]="state"
      [(visible)]="visible"
      (apply)="applied.push($event)"
    ></app-column-filter-popup>`,
})
class HostComponent {
  column: FilterColumn | null = {
    field: 'netWeight',
    caption: 'Нетто',
    kind: 'number',
  };
  state: GridFilterState = {
    plant: { values: ['Завод Юг'], texts: { 'Завод Юг': 'Завод Юг' } },
  };
  visible = false;
  applied: ColumnFilterApply[] = [];
}

const PLANT_FILTER: FilterCondition = ['plant', '=', 'Завод Юг'];

/** `toEqual` над рекурсивным FilterExpression не типизируется (TS2589), сравниваем как unknown. */
const plain = (value: unknown): unknown => value;

describe('ColumnFilterPopupComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let data: DataServiceStub;

  const query = <T>(type: new (...args: never[]) => T): T | null => {
    const found = fixture.debugElement.query(By.directive(type));
    return found === null ? null : found.componentInstance;
  };
  const popup = (): ColumnFilterPopupComponent =>
    query(ColumnFilterPopupComponent)!;
  const button = (testId: string) =>
    fixture.debugElement.query(By.css(`[data-testid="${testId}"]`));
  const press = (testId: string): void => {
    button(testId).triggerEventHandler('onClick', {});
    fixture.detectChanges();
  };
  const itemCheck = (index: number): DxCheckBoxComponent =>
    fixture.debugElement.queryAll(
      By.css('[data-testid="filter-list-item-check"]')
    )[index].componentInstance;
  const numericFrom = (): DxNumberBoxComponent =>
    fixture.debugElement.query(By.css('[data-testid="numeric-range-from"]'))
      .componentInstance;

  const open = (column: Partial<FilterColumn> = {}): void => {
    host.column = {
      field: 'netWeight',
      caption: 'Нетто',
      kind: 'number',
      ...column,
    };
    host.visible = true;
    fixture.detectChanges();
  };

  beforeEach(() => {
    data = new DataServiceStub();
    TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [BrowserTransferStateModule, FiltersModule],
      providers: [{ provide: DataService, useValue: data }],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('пока popup закрыт, запросов нет', () => {
    expect(data.distinctCalls).toEqual([]);
    expect(plain(data.statsCalls)).toEqual([]);
    expect(query(DependentMultiCheckboxFilterComponent)).toBeNull();
  });

  it('popup показывает диапазон только для number и date', () => {
    open({ kind: 'number' });
    expect(plain(data.statsCalls)).toEqual([
      { field: 'netWeight', filter: PLANT_FILTER },
    ]);
    data.respondStats({ min: 1, max: 100, count: 5 });
    fixture.detectChanges();
    expect(query(ExcelNumericFilterComponent)).not.toBeNull();
    expect(query(DateRangeFilterComponent)).toBeNull();
    expect(query(DependentMultiCheckboxFilterComponent)).not.toBeNull();

    open({ field: 'date', caption: 'Дата', kind: 'date' });
    expect(plain(data.lastStats)).toEqual({ field: 'date', filter: PLANT_FILTER });
    data.respondStats({ min: '2020-02-01', max: '2026-10-31', count: 5 });
    fixture.detectChanges();
    expect(query(DateRangeFilterComponent)).not.toBeNull();
    expect(query(ExcelNumericFilterComponent)).toBeNull();

    const plainKinds: ColumnKind[] = ['string', 'enum', 'labels'];
    plainKinds.forEach((kind) => {
      open({ field: kind, caption: kind, kind });
      expect(data.statsCalls.length).toBe(2);
      expect(query(DateRangeFilterComponent)).toBeNull();
      expect(query(ExcelNumericFilterComponent)).toBeNull();
      expect(query(DependentMultiCheckboxFilterComponent)).not.toBeNull();
    });
  });

  it('список получает фильтр других колонок без своей', () => {
    open();
    expect(plain(data.distinctCalls)).toEqual([
      { field: 'netWeight', filter: PLANT_FILTER, search: undefined },
    ]);
  });

  it('Применить выдаёт values вместе с from/to', () => {
    open();
    data.respondStats({ min: 1, max: 100, count: 5 });
    fixture.detectChanges();
    data.respondDistinct(items([10.5, '10,5'], [20, '20']));
    fixture.detectChanges();
    itemCheck(0).instance.option('value', true);
    fixture.detectChanges();
    numericFrom().instance.option('value', 10);
    fixture.detectChanges();
    press('column-filter-apply');
    expect(host.applied).toEqual([
      {
        field: 'netWeight',
        value: { values: [10.5], from: 10, texts: { '10.5': '10,5' } },
      },
    ]);
    expect(host.visible).toBeFalse();
  });

  it('Очистить выдаёт null', () => {
    open();
    press('column-filter-clear');
    expect(host.applied).toEqual([{ field: 'netWeight', value: null }]);
    expect(host.visible).toBeFalse();
  });

  it('Применить без выбора и диапазона выдаёт null', () => {
    open();
    data.respondStats({ min: 1, max: 100, count: 5 });
    fixture.detectChanges();
    data.respondDistinct(items([10.5, '10,5']));
    fixture.detectChanges();
    press('column-filter-apply');
    expect(host.applied).toEqual([{ field: 'netWeight', value: null }]);
  });

  it('Отмена закрывает без apply', () => {
    open();
    press('column-filter-cancel');
    expect(host.applied).toEqual([]);
    expect(host.visible).toBeFalse();
    expect(query(DependentMultiCheckboxFilterComponent)).toBeNull();
  });

  it('Смена диапазона в черновике обновляет фильтр списка', () => {
    open();
    data.respondStats({ min: 1, max: 100, count: 5 });
    fixture.detectChanges();
    numericFrom().instance.option('value', 10);
    fixture.detectChanges();
    expect(data.distinctCalls.length).toBe(2);
    expect(plain(data.lastDistinct.filter)).toEqual([
      PLANT_FILTER,
      'and',
      ['netWeight', '>=', 10],
    ]);
    expect(data.statsCalls.length).toBe(1);
  });

  it('открывается с выбранными значениями и диапазоном колонки из state', () => {
    host.state = {
      ...host.state,
      netWeight: { values: [20], from: 5, texts: { '20': '20,0' } },
    };
    open();
    expect(plain(data.lastDistinct.filter)).toEqual([
      PLANT_FILTER,
      'and',
      ['netWeight', '>=', 5],
    ]);
    data.respondStats({ min: 1, max: 100, count: 5 });
    fixture.detectChanges();
    expect(numericFrom().instance.option('value')).toBe(5);
    data.respondDistinct({
      ...items([10.5, '10,5']),
      totalCount: 5000,
      truncated: true,
    });
    fixture.detectChanges();
    press('column-filter-apply');
    expect(host.applied).toEqual([
      {
        field: 'netWeight',
        value: { values: [20], from: 5, texts: { '20': '20,0' } },
      },
    ]);
  });

  it('ошибка stats показывается в popup, список остаётся', () => {
    open();
    data.failStats('Нет статистики');
    fixture.detectChanges();
    const error: HTMLElement | null = document.querySelector(
      '[data-testid="column-filter-bounds-error"]'
    );
    expect(error!.textContent).toContain('Нет статистики');
    expect(query(ExcelNumericFilterComponent)).toBeNull();
    expect(query(DependentMultiCheckboxFilterComponent)).not.toBeNull();
  });

  it('повторное открытие запрашивает список заново', () => {
    open();
    press('column-filter-cancel');
    open();
    expect(data.distinctCalls.length).toBe(2);
    expect(popup().visible).toBeTrue();
  });
});

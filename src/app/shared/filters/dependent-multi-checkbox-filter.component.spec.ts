import { Component } from '@angular/core';
import {
  ComponentFixture,
  fakeAsync,
  flush,
  TestBed,
  tick,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrowserTransferStateModule } from '@angular/platform-browser';
import { DxCheckBoxComponent } from 'devextreme-angular/ui/check-box';
import { DxTextBoxComponent } from 'devextreme-angular/ui/text-box';

import { DataService } from '../../core/data.service';
import {
  FilterExpression,
  FilterValue,
} from '../../models/column-filter.model';
import { DependentMultiCheckboxFilterComponent } from './dependent-multi-checkbox-filter.component';
import { FiltersModule } from './filters.module';
import { DataServiceStub, items } from './testing/data-service.stub';

@Component({
  template: `<app-dependent-multi-checkbox-filter
    [field]="field"
    [filter]="filter"
    [selected]="selected"
    (selectedChange)="emitted.push($event)"
  ></app-dependent-multi-checkbox-filter>`,
})
class HostComponent {
  field = 'line';
  filter: FilterExpression | null = [['plant', '=', 'Завод Юг']];
  selected?: FilterValue[];
  emitted: Array<FilterValue[] | undefined> = [];
}

/** `toEqual` над рекурсивным FilterExpression не типизируется (TS2589), сравниваем как unknown. */
const plain = (value: unknown): unknown => value;

describe('DependentMultiCheckboxFilterComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let data: DataServiceStub;

  const el = (testId: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const all = (testId: string): HTMLElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`));
  const checkBox = (testId: string, index = 0): DxCheckBoxComponent =>
    fixture.debugElement.queryAll(By.css(`[data-testid="${testId}"]`))[index]
      .componentInstance;
  const component = (): DependentMultiCheckboxFilterComponent =>
    fixture.debugElement.query(
      By.directive(DependentMultiCheckboxFilterComponent)
    ).componentInstance;

  beforeEach(() => {
    data = new DataServiceStub();
    TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [BrowserTransferStateModule, FiltersModule],
      providers: [{ provide: DataService, useValue: data }],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  it('запрашивает список при открытии с переданным фильтром', () => {
    fixture.detectChanges();
    expect(plain(data.distinctCalls)).toEqual([
      { field: 'line', filter: [['plant', '=', 'Завод Юг']], search: undefined },
    ]);
    expect(el('filter-list-loading')).not.toBeNull();
  });

  it('повторный запрос при смене filter', () => {
    fixture.detectChanges();
    host.filter = [['plant', '=', 'Завод Север']];
    fixture.detectChanges();
    expect(data.distinctCalls.length).toBe(2);
    expect(plain(data.lastDistinct.filter)).toEqual([['plant', '=', 'Завод Север']]);
  });

  it('поиск вызывает distinct со строкой search с задержкой 300 мс', fakeAsync(() => {
    fixture.detectChanges();
    const search: DxTextBoxComponent = fixture.debugElement.query(
      By.css('[data-testid="filter-list-search"]')
    ).componentInstance;
    search.instance.option('value', 'юг');
    tick(299);
    expect(data.distinctCalls.length).toBe(1);
    tick(1);
    expect(data.distinctCalls.length).toBe(2);
    expect(plain(data.lastDistinct)).toEqual({
      field: 'line',
      filter: [['plant', '=', 'Завод Юг']],
      search: 'юг',
    });
    flush();
  }));

  it('показывает text, а не value', () => {
    fixture.detectChanges();
    data.respondDistinct(items([1, 'В работе']));
    fixture.detectChanges();
    const rows = all('filter-list-item');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent!.trim()).toBe('В работе');
    expect(el('filter-list-loading')).toBeNull();
  });

  it('подпись об усечении видна при truncated', () => {
    fixture.detectChanges();
    data.respondDistinct({
      ...items(['a', 'A'], ['b', 'B'], ['c', 'C']),
      totalCount: 10,
      truncated: true,
    });
    fixture.detectChanges();
    expect(el('filter-list-truncated')!.textContent!.trim()).toBe(
      'Показаны первые 3, уточните поиском'
    );
    expect(checkBox('filter-list-select-all').instance.option('text')).toBe(
      'Выбрать показанные (3)'
    );
  });

  it('без усечения подписи нет и чекбокс называется «Выбрать всё»', () => {
    fixture.detectChanges();
    data.respondDistinct(items(['a', 'A']));
    fixture.detectChanges();
    expect(el('filter-list-truncated')).toBeNull();
    expect(checkBox('filter-list-select-all').instance.option('text')).toBe(
      'Выбрать всё'
    );
  });

  it('переключение значения и «Выбрать всё» выдают selectedChange', () => {
    fixture.detectChanges();
    data.respondDistinct(items(['a', 'A'], ['b', 'B']));
    fixture.detectChanges();
    checkBox('filter-list-item-check', 1).instance.option('value', true);
    fixture.detectChanges();
    expect(host.emitted).toEqual([['b']]);
    checkBox('filter-list-select-all').instance.option('value', true);
    fixture.detectChanges();
    expect(host.emitted.length).toBe(2);
    expect(host.emitted[1]).toBeUndefined();
    expect(component().model.allSelected).toBeTrue();
    checkBox('filter-list-select-all').instance.option('value', false);
    fixture.detectChanges();
    expect(host.emitted.length).toBe(3);
    expect(component().model.toValues()).toBeUndefined();
    expect(component().model.isSelected('a')).toBeFalse();
  });

  it('программное обновление чекбоксов не меняет выбор', () => {
    fixture.detectChanges();
    data.respondDistinct(items(['a', 'A'], ['b', 'B']));
    fixture.detectChanges();
    checkBox('filter-list-item-check', 0).instance.option('value', true);
    fixture.detectChanges();
    checkBox('filter-list-item-check', 1).instance.option('value', true);
    fixture.detectChanges();
    expect(component().model.allSelected).toBeTrue();
    checkBox('filter-list-item-check', 1).instance.option('value', false);
    fixture.detectChanges();
    expect(component().model.isSelected('a')).toBeTrue();
    expect(component().model.isSelected('b')).toBeFalse();
    expect(host.emitted.length).toBe(3);
  });

  it('восстанавливает выбранные значения из selected', () => {
    host.selected = ['b'];
    fixture.detectChanges();
    data.respondDistinct(items(['a', 'A'], ['b', 'B']));
    fixture.detectChanges();
    expect(
      checkBox('filter-list-item-check', 1).instance.option('value')
    ).toBeTrue();
    expect(
      checkBox('filter-list-item-check', 0).instance.option('value')
    ).toBeFalse();
    expect(component().textOf('b')).toBe('B');
  });

  it('значения, которых нет в полном ответе, выбывают с событием selectedChange', () => {
    host.selected = ['a', 'b'];
    fixture.detectChanges();
    data.respondDistinct(items(['a', 'A'], ['c', 'C']));
    fixture.detectChanges();
    expect(host.emitted).toEqual([['a']]);
    expect(component().model.isSelected('b')).toBeFalse();
    host.filter = null;
    fixture.detectChanges();
    data.respondDistinct(items(['a', 'A'], ['c', 'C']));
    fixture.detectChanges();
    expect(host.emitted.length).toBe(1);
  });

  it('ошибка сервера показывается внутри списка', () => {
    fixture.detectChanges();
    data.failDistinct('Сбой сервера');
    fixture.detectChanges();
    expect(el('filter-list-error')!.textContent).toContain('Сбой сервера');
    expect(el('filter-list-loading')).toBeNull();
  });

  it('устаревший ответ не применяется', () => {
    fixture.detectChanges();
    host.filter = null;
    fixture.detectChanges();
    data.respondDistinct(items(['old', 'Старое']), 0);
    fixture.detectChanges();
    expect(all('filter-list-item').length).toBe(0);
    data.respondDistinct(items(['new', 'Новое']), 1);
    fixture.detectChanges();
    expect(all('filter-list-item')[0].textContent!.trim()).toBe('Новое');
  });

  it('при 5000 значениях рисует только видимое окно', () => {
    fixture.detectChanges();
    const pairs: Array<[number, string]> = [];
    for (let i = 0; i < 5000; i += 1) {
      pairs.push([i, `Значение ${i}`]);
    }
    data.respondDistinct(items(...pairs));
    fixture.detectChanges();
    expect(all('filter-list-item').length).toBeLessThan(40);
    const spacer = el('filter-list-spacer')!;
    expect(spacer.style.height).toBe(`${5000 * component().rowHeight}px`);
    const viewport = el('filter-list-viewport')!;
    viewport.scrollTop = 2500 * component().rowHeight;
    viewport.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
    expect(all('filter-list-item')[0].textContent!.trim()).toBe(
      'Значение 2500'
    );
  });
});

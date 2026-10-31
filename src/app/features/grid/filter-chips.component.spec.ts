import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrowserTransferStateModule } from '@angular/platform-browser';
import { DxButtonModule } from 'devextreme-angular/ui/button';

import { GridFilterState } from '../../models/column-filter.model';
import {
  chipText,
  FilterChipColumn,
  FilterChipsComponent,
} from './filter-chips.component';

@Component({
  template: `<app-filter-chips
    [columns]="columns"
    [state]="state"
    (remove)="removed.push($event)"
    (clear)="cleared = cleared + 1"
  ></app-filter-chips>`,
})
class HostComponent {
  columns: FilterChipColumn[] = [
    { field: 'id', caption: 'Идентификатор', kind: 'number' },
    { field: 'date', caption: 'Дата', kind: 'date' },
    { field: 'plant', caption: 'Завод', kind: 'string' },
    { field: 'netWeight', caption: 'Нетто, кг', kind: 'number' },
    { field: 'status', caption: 'Статус', kind: 'enum' },
  ];
  state: GridFilterState = {};
  removed: string[] = [];
  cleared = 0;
}

describe('FilterChipsComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const el = (testId: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const chips = (): HTMLElement[] =>
    Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid^="filter-chip-"]')
    ).filter(
      (e) =>
        !(e as HTMLElement).dataset.testid!.startsWith('filter-chip-remove-')
    ) as HTMLElement[];
  const text = (testId: string): string =>
    el(testId)!.textContent!.replace(/\s+/g, ' ').trim();

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [HostComponent, FilterChipsComponent],
      imports: [BrowserTransferStateModule, DxButtonModule],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  it('без фильтров строки нет', () => {
    fixture.detectChanges();
    expect(el('filter-chips')).toBeNull();
    expect(chips()).toEqual([]);
  });

  it('чип показывает подпись колонки и тексты значений в порядке колонок', () => {
    host.state = {
      status: { values: [2, 1], texts: { '1': 'В работе', '2': 'Агрегирован' } },
      plant: { values: ['Завод Юг'], texts: { 'Завод Юг': 'Завод Юг' } },
    };
    fixture.detectChanges();
    expect(el('filter-chips')).not.toBeNull();
    expect(chips().map((c) => c.dataset.testid)).toEqual([
      'filter-chip-plant',
      'filter-chip-status',
    ]);
    expect(text('filter-chip-plant')).toContain('Завод: Завод Юг');
    expect(text('filter-chip-status')).toContain(
      'Статус: Агрегирован, В работе'
    );
  });

  it('значение без текста показывается как есть, лишние сворачиваются в «ещё N»', () => {
    host.state = {
      id: { values: [1, 2, 3, 4, 5], texts: { '1': '1', '2': '2' } },
    };
    fixture.detectChanges();
    expect(text('filter-chip-id')).toContain('Идентификатор: 1, 2, 3, ещё 2');
  });

  it('диапазон дат показывается «с … по …» в формате dd.MM.yyyy', () => {
    host.state = { date: { from: '2021-01-05', to: '2021-12-31' } };
    fixture.detectChanges();
    expect(text('filter-chip-date')).toContain(
      'Дата: с 05.01.2021 по 31.12.2021'
    );

    host.state = { date: { from: '2021-01-05' } };
    fixture.detectChanges();
    expect(text('filter-chip-date')).toContain('Дата: с 05.01.2021');

    host.state = { date: { from: null, to: '2021-12-31' } };
    fixture.detectChanges();
    expect(text('filter-chip-date')).toContain('Дата: по 31.12.2021');
  });

  it('числовой диапазон вместе со значениями', () => {
    host.state = {
      netWeight: { values: [10.5], from: 10, to: 20.5, texts: { '10.5': '10,5' } },
    };
    fixture.detectChanges();
    expect(text('filter-chip-netWeight')).toContain(
      'Нетто, кг: 10,5, с 10 по 20,5'
    );
  });

  it('× снимает фильтр своей колонки', () => {
    host.state = {
      plant: { values: ['Завод Юг'] },
      status: { values: [1], texts: { '1': 'В работе' } },
    };
    fixture.detectChanges();
    el('filter-chip-remove-status')!.click();
    fixture.detectChanges();
    expect(host.removed).toEqual(['status']);
  });

  it('«Сбросить фильтры» есть при двух и более чипах и выдаёт clear', () => {
    host.state = { plant: { values: ['Завод Юг'] } };
    fixture.detectChanges();
    expect(el('filter-chips-clear')).toBeNull();

    host.state = { ...host.state, status: { values: [1] } };
    fixture.detectChanges();
    fixture.debugElement
      .query(By.css('[data-testid="filter-chips-clear"]'))
      .triggerEventHandler('onClick', {});
    expect(host.cleared).toBe(1);
  });

  it('колонка не из списка показывается по имени поля', () => {
    host.state = { unknown: { values: ['x'] } };
    fixture.detectChanges();
    expect(text('filter-chip-unknown')).toContain('unknown: x');
  });

  describe('chipText', () => {
    it('пустое состояние даёт пустую строку', () => {
      expect(chipText('string', {})).toBe('');
      expect(chipText('date', { from: null, to: null, values: [] })).toBe('');
    });

    it('даты вне формата yyyy-MM-dd остаются как есть', () => {
      expect(chipText('date', { from: 'вчера' })).toBe('с вчера');
    });
  });
});

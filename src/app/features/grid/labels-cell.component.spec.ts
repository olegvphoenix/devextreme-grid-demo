import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import Toast from 'devextreme/ui/toast';

import { DataService } from '../../core/data.service';
import { ProductionRecord } from '../../models/production-record.model';
import {
  DataServiceStub,
  items,
} from '../../shared/filters/testing/data-service.stub';
import { LabelsCellComponent } from './labels-cell.component';

@Component({
  template: `<div
    data-testid="row"
    (click)="rowClicks = rowClicks + 1"
    (pointerdown)="rowPointerDowns = rowPointerDowns + 1"
    (keydown)="rowKeys = rowKeys + 1"
  >
    <app-labels-cell
      [id]="id"
      [labels]="labels"
      (labelsChange)="changes.push($event)"
    ></app-labels-cell>
  </div>`,
})
class HostComponent {
  id = 7;
  labels: string[] = ['срочно', 'брак'];
  changes: string[][] = [];
  rowClicks = 0;
  rowPointerDowns = 0;
  rowKeys = 0;
}

/** `toEqual` над рекурсивным FilterExpression не типизируется (TS2589), сравниваем как unknown. */
const plain = (value: unknown): unknown => value;

function record(labels: string[]): ProductionRecord {
  return {
    id: 7,
    date: '2021-05-01',
    plant: 'Завод Юг',
    line: 'Линия 1',
    product: 'Продукт',
    batch: 'П-1',
    netWeight: 10.5,
    grossWeight: 11,
    qty: 3,
    markingCode: '01',
    ean13: '4600000000000',
    status: 1,
    operator: 'Оператор',
    labels,
    labelsKey: labels.length === 0 ? '' : `|${labels.join('|')}|`,
  };
}

describe('LabelsCellComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let data: DataServiceStub;

  const el = (testId: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const all = (testId: string): HTMLElement[] =>
    Array.from(
      fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`)
    );
  const chips = (): string[] =>
    all('label-chip').map((chip) => chip.textContent!.trim());
  const input = (): HTMLInputElement | null =>
    el('label-input') as HTMLInputElement | null;
  const toastText = (): string =>
    Array.from(document.body.querySelectorAll('.dx-toast-message'))
      .map((e) => e.textContent!.trim())
      .join('\n');

  const openEditor = (): void => {
    el('label-add')!.click();
    fixture.detectChanges();
  };
  const key = (target: HTMLElement, name: string): KeyboardEvent => {
    const event = new KeyboardEvent('keydown', {
      key: name,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };
  const typeAndEnter = (text: string): void => {
    openEditor();
    input()!.value = text;
    key(input()!, 'Enter');
  };

  beforeEach(() => {
    data = new DataServiceStub();
    TestBed.configureTestingModule({
      declarations: [HostComponent, LabelsCellComponent],
      providers: [{ provide: DataService, useValue: data }],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    document.body
      .querySelectorAll('.dx-toast')
      .forEach((toast) => Toast.getInstance(toast)?.dispose());
  });

  it('показывает чипы ярлыков в порядке списка и подсказку со всеми', () => {
    expect(chips()).toEqual(['срочно', 'брак']);
    expect(el('labels-cell')!.title).toBe('срочно, брак');
    expect(input()).toBeNull();
    expect(data.labelsCalls).toEqual([]);
  });

  it('добавление вызывает updateLabels с новым списком', () => {
    typeAndEnter('  новый ');
    expect(data.labelsCalls).toEqual([
      { id: 7, labels: ['срочно', 'брак', 'новый'] },
    ]);
    expect(chips()).toEqual(['срочно', 'брак', 'новый']);
    expect(input()).toBeNull();
    expect(host.changes).toEqual([]);

    data.respondLabels(record(['срочно', 'брак', 'новый']));
    fixture.detectChanges();
    expect(host.changes).toEqual([['срочно', 'брак', 'новый']]);
  });

  it('дубликат не отправляется, сообщение показывается сразу', () => {
    typeAndEnter('Срочно');
    expect(data.labelsCalls).toEqual([]);
    expect(toastText()).toContain('Такой ярлык уже есть');
    expect(input()).not.toBeNull();
    expect(chips()).toEqual(['срочно', 'брак']);
  });

  it('пустая строка не отправляется и закрывает поле', () => {
    typeAndEnter('   ');
    expect(data.labelsCalls).toEqual([]);
    expect(input()).toBeNull();
    expect(toastText()).toBe('');
  });

  it('символ | не отправляется, сообщение показывается сразу', () => {
    typeAndEnter('а|б');
    expect(data.labelsCalls).toEqual([]);
    expect(toastText()).toContain('символ |');
    expect(input()).not.toBeNull();
  });

  it('Escape закрывает поле без запроса', () => {
    openEditor();
    input()!.value = 'новый';
    key(input()!, 'Escape');
    expect(input()).toBeNull();
    expect(data.labelsCalls).toEqual([]);
    expect(el('label-add')).not.toBeNull();
  });

  it('удаление отправляет список без ярлыка', () => {
    all('label-remove')[1].click();
    fixture.detectChanges();
    expect(data.labelsCalls).toEqual([{ id: 7, labels: ['срочно'] }]);
    expect(chips()).toEqual(['срочно']);

    data.respondLabels(record(['срочно']));
    fixture.detectChanges();
    expect(host.changes).toEqual([['срочно']]);
  });

  it('ошибка возвращает прежний список и показывает ошибку', () => {
    all('label-remove')[1].click();
    fixture.detectChanges();
    data.failLabels(400, 'Поле labels обязательно: непустые строки без символа |');
    fixture.detectChanges();
    expect(chips()).toEqual(['срочно', 'брак']);
    expect(toastText()).toContain(
      'Поле labels обязательно: непустые строки без символа |'
    );
    expect(host.changes).toEqual([]);
    expect(
      all('label-remove').every((button) => !(button as HTMLButtonElement).disabled)
    ).toBeTrue();
  });

  it('пока запрос идёт, второе изменение не отправляется', () => {
    all('label-remove')[1].click();
    fixture.detectChanges();
    const remaining = all('label-remove')[0] as HTMLButtonElement;
    expect(remaining.disabled).toBeTrue();
    expect((el('label-add') as HTMLButtonElement).disabled).toBeTrue();
    remaining.click();
    fixture.detectChanges();
    expect(data.labelsCalls.length).toBe(1);
  });

  it('клик и клавиши не доходят до строки', () => {
    openEditor();
    input()!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    input()!.click();
    key(input()!, 'a');
    all('label-remove')[0].click();
    fixture.detectChanges();
    expect(host.rowClicks).toBe(0);
    expect(host.rowPointerDowns).toBe(0);
    expect(host.rowKeys).toBe(0);
  });

  it('поле ввода ограничено 32 символами, как ярлык на сервере', () => {
    openEditor();
    expect(input()!.maxLength).toBe(32);
  });

  it('открытое поле получает фокус и подсказки без уже стоящих ярлыков', () => {
    openEditor();
    expect(document.activeElement).toBe(input());
    expect(plain(data.distinctCalls)).toEqual([
      { field: 'labels', filter: null, search: undefined },
    ]);
    data.respondDistinct(
      items(['срочно', 'срочно'], ['новый', 'новый'], ['проверить', 'проверить'])
    );
    fixture.detectChanges();
    const list = fixture.nativeElement.querySelector(
      `datalist#${input()!.getAttribute('list')}`
    ) as HTMLDataListElement;
    expect(Array.from(list.options).map((o) => o.value)).toEqual([
      'новый',
      'проверить',
    ]);
  });

  it('пустой список рисует только кнопку добавления', () => {
    host.labels = [];
    fixture.detectChanges();
    expect(chips()).toEqual([]);
    expect(el('labels-cell')!.title).toBe('');
    expect(el('label-add')).not.toBeNull();
  });
});

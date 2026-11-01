import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserTransferStateModule, By } from '@angular/platform-browser';
import { DxButtonModule } from 'devextreme-angular/ui/button';

import { SettingsComponent } from './settings.component';

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;

  const rows = (): HTMLElement[] =>
    Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="settings-row"]')
    );
  const keyOf = (row: HTMLElement): string =>
    row.querySelector('[data-testid="settings-key"]')!.textContent!.trim();
  const valueOf = (row: HTMLElement): string =>
    row.querySelector('[data-testid="settings-value"]')!.textContent!;
  const press = (testId: string, index = 0): void => {
    fixture.debugElement
      .queryAll(By.css(`[data-testid="${testId}"]`))
      [index].triggerEventHandler('onClick', {});
    fixture.detectChanges();
  };

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('dxgrid-demo:state', '{"pageIndex":2,"pageSize":50}');
    localStorage.setItem('dxgrid-demo:dataset', '1000000');
    localStorage.setItem('other-app:value', '{"x":1}');
    TestBed.configureTestingModule({
      imports: [BrowserTransferStateModule, DxButtonModule],
      declarations: [SettingsComponent],
    });
    fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  it('выводит ключи приложения со значениями по алфавиту, чужие ключи не выводит', () => {
    expect(rows().map(keyOf)).toEqual([
      'dxgrid-demo:dataset',
      'dxgrid-demo:state',
    ]);
    expect(valueOf(rows()[0]).trim()).toBe('1000000');
  });

  it('значение JSON отформатировано с отступами', () => {
    expect(valueOf(rows()[1]).trim()).toBe(
      '{\n  "pageIndex": 2,\n  "pageSize": 50\n}'
    );
  });

  it('значение, которое не JSON, показывается как есть', () => {
    localStorage.setItem('dxgrid-demo:raw', '{broken');
    press('settings-refresh');
    const raw = rows().find((row) => keyOf(row) === 'dxgrid-demo:raw');
    expect(valueOf(raw!).trim()).toBe('{broken');
  });

  it('«Обновить» перечитывает хранилище', () => {
    localStorage.setItem('dxgrid-demo:filters', '{}');
    expect(rows().length).toBe(2);
    press('settings-refresh');
    expect(rows().length).toBe(3);
  });

  it('«Удалить ключ» удаляет только свой ключ', () => {
    press('settings-remove', 1);
    expect(localStorage.getItem('dxgrid-demo:state')).toBeNull();
    expect(localStorage.getItem('dxgrid-demo:dataset')).toBe('1000000');
    expect(rows().map(keyOf)).toEqual(['dxgrid-demo:dataset']);
  });

  it('«Очистить всё» удаляет ключи приложения и не трогает чужие', () => {
    press('settings-clear');
    expect(rows().length).toBe(0);
    expect(localStorage.getItem('other-app:value')).toBe('{"x":1}');
    expect(
      fixture.nativeElement.querySelector('[data-testid="settings-empty"]')
    ).not.toBeNull();
  });
});

import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatusBadgeComponent } from './status-badge.component';

@Component({
  template: `<app-status-badge [status]="status"></app-status-badge>`,
})
class HostComponent {
  status = 0;
}

describe('StatusBadgeComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const badge = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-testid="status-badge"]');

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [HostComponent, StatusBadgeComponent],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  it('подпись и CSS-класс на каждый статус', () => {
    const expected: Array<[number, string, string]> = [
      [0, 'Новый', 'status-badge--new'],
      [1, 'В работе', 'status-badge--in-progress'],
      [2, 'Агрегирован', 'status-badge--aggregated'],
      [3, 'Закрыт', 'status-badge--closed'],
    ];
    expected.forEach(([status, text, cssClass]) => {
      host.status = status;
      fixture.detectChanges();
      expect(badge().textContent!.trim()).withContext(String(status)).toBe(text);
      expect(badge().classList.contains('status-badge')).toBeTrue();
      expect(badge().classList.contains(cssClass))
        .withContext(String(status))
        .toBeTrue();
    });
  });

  it('у каждого статуса свой класс', () => {
    host.status = 1;
    fixture.detectChanges();
    expect(badge().classList.contains('status-badge--new')).toBeFalse();
    expect(badge().classList.contains('status-badge--closed')).toBeFalse();
  });

  it('неизвестный статус показывается числом без класса цвета', () => {
    host.status = 7;
    fixture.detectChanges();
    expect(badge().textContent!.trim()).toBe('7');
    expect(Array.from(badge().classList)).toEqual(['status-badge']);
  });
});

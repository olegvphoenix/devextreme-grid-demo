import { Component, Input } from '@angular/core';

import {
  RecordStatus,
  STATUS_NAMES,
} from '../../models/production-record.model';

/** Модификатор класса бейджа по статусу: цвета заданы в CSS токенами. */
export const STATUS_CLASSES: Record<RecordStatus, string> = {
  0: 'new',
  1: 'in-progress',
  2: 'aggregated',
  3: 'closed',
};

@Component({
  selector: 'app-status-badge',
  template: `<span [class]="cssClass" data-testid="status-badge">{{
    text
  }}</span>`,
  styles: [
    `
      /* Единственное место с цветами: палитра Material light. */
      :host {
        --status-new-bg: #e3f2fd;
        --status-new-fg: #0d47a1;
        --status-in-progress-bg: #fff3e0;
        --status-in-progress-fg: #e65100;
        --status-aggregated-bg: #e8f5e9;
        --status-aggregated-fg: #1b5e20;
        --status-closed-bg: #eeeeee;
        --status-closed-fg: #424242;
      }

      .status-badge {
        display: inline-block;
        max-width: 100%;
        padding: 0 8px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 500;
        line-height: 20px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: middle;
      }

      .status-badge--new {
        background: var(--status-new-bg);
        color: var(--status-new-fg);
      }

      .status-badge--in-progress {
        background: var(--status-in-progress-bg);
        color: var(--status-in-progress-fg);
      }

      .status-badge--aggregated {
        background: var(--status-aggregated-bg);
        color: var(--status-aggregated-fg);
      }

      .status-badge--closed {
        background: var(--status-closed-bg);
        color: var(--status-closed-fg);
      }
    `,
  ],
})
export class StatusBadgeComponent {
  @Input() status: number = 0;

  get text(): string {
    return isRecordStatus(this.status)
      ? STATUS_NAMES[this.status]
      : String(this.status);
  }

  get cssClass(): string {
    return isRecordStatus(this.status)
      ? `status-badge status-badge--${STATUS_CLASSES[this.status]}`
      : 'status-badge';
  }
}

function isRecordStatus(value: number): value is RecordStatus {
  return value in STATUS_NAMES;
}

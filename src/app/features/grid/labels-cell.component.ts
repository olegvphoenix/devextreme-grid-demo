import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import notify from 'devextreme/ui/notify';
import { Subscription } from 'rxjs';

import { ApiError } from '../../core/api-error';
import { DataService } from '../../core/data.service';

const NOTIFY_ERROR_MS = 3000;
/** Такие же правила на сервере: он отвергает пустые ярлыки и символ `|`. */
const FORBIDDEN_CHAR = '|';
const MESSAGE_DUPLICATE = 'Такой ярлык уже есть';
const MESSAGE_FORBIDDEN_CHAR = 'Ярлык не может содержать символ |';

let nextListId = 0;

/**
 * Ячейка «Ярлыки»: чипы с удалением, «+» открывает поле ввода, Enter
 * отправляет `PUT /labels`. Список меняется сразу и откатывается при ошибке;
 * пока запрос идёт, ячейка заблокирована. События не всплывают до строки
 * грида: клик не выбирает строку и ячейку, клавиши не ходят по ячейкам.
 */
@Component({
  selector: 'app-labels-cell',
  templateUrl: './labels-cell.component.html',
  styleUrls: ['./labels-cell.component.css'],
})
export class LabelsCellComponent implements OnDestroy {
  @Input() id: number = 0;
  @Input() labels: string[] = [];
  /** Список, подтверждённый сервером, после успешного сохранения. */
  @Output() labelsChange = new EventEmitter<string[]>();

  readonly listId = `labels-presets-${nextListId++}`;
  editing = false;
  busy = false;
  presets: string[] = [];

  private presetsSubscription: Subscription | null = null;

  constructor(private readonly data: DataService) {}

  /** Поле появляется по `*ngIf`; фокус ставится, как только оно отрисовано. */
  @ViewChild('editor')
  set editor(ref: ElementRef<HTMLInputElement> | undefined) {
    ref?.nativeElement.focus();
  }

  get hint(): string {
    return this.labels.join(', ');
  }

  ngOnDestroy(): void {
    this.presetsSubscription?.unsubscribe();
  }

  trackByLabel(_: number, label: string): string {
    return label;
  }

  stopEvent(event: Event): void {
    event.stopPropagation();
  }

  startEditing(): void {
    if (this.busy) {
      return;
    }
    this.editing = true;
    this.loadPresets();
  }

  cancelEditing(): void {
    this.editing = false;
  }

  onEditorKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.add((event.target as HTMLInputElement).value);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelEditing();
    }
  }

  add(raw: string): void {
    const label = raw.trim();
    if (label === '') {
      this.cancelEditing();
      return;
    }
    if (label.includes(FORBIDDEN_CHAR)) {
      notify(MESSAGE_FORBIDDEN_CHAR, 'error', NOTIFY_ERROR_MS);
      return;
    }
    if (this.labels.some((l) => l.toLowerCase() === label.toLowerCase())) {
      notify(MESSAGE_DUPLICATE, 'error', NOTIFY_ERROR_MS);
      return;
    }
    this.cancelEditing();
    this.save([...this.labels, label]);
  }

  remove(label: string): void {
    this.save(this.labels.filter((l) => l !== label));
  }

  private save(next: string[]): void {
    if (this.busy) {
      return;
    }
    const previous = this.labels;
    this.labels = next;
    this.busy = true;
    this.data.updateLabels(this.id, next).subscribe({
      next: (record) => {
        this.busy = false;
        this.labels = record.labels;
        this.labelsChange.emit(record.labels);
      },
      error: (e: ApiError) => {
        this.busy = false;
        this.labels = previous;
        notify(e.message, 'error', NOTIFY_ERROR_MS);
      },
    });
  }

  /** Подсказки — ярлыки набора из `distinct`; без ответа поле остаётся свободным. */
  private loadPresets(): void {
    this.presetsSubscription?.unsubscribe();
    this.presetsSubscription = this.data.distinct('labels', null).subscribe({
      next: (result) => {
        const current = new Set(this.labels);
        this.presets = result.items
          .map((item) => String(item.value))
          .filter((label) => !current.has(label));
      },
      error: () => (this.presets = []),
    });
  }
}

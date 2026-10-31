import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { DataService } from '../../core/data.service';
import {
  FilterExpression,
  FilterValue,
} from '../../models/column-filter.model';
import { DistinctItem } from '../../models/distinct.model';
import { DependentListModel } from './dependent-list.model';

const SEARCH_DEBOUNCE_MS = 300;
const ROW_HEIGHT_PX = 32;
const VIEWPORT_ROWS = 8;
const OVERSCAN_ROWS = 2;

/**
 * Список значений колонки с поиском и «выбрать всё»; данные с сервера под
 * фильтром `filter`. Рисуется только видимое окно строк: dx-list на 5000
 * элементах отрисовывался 12,7 с, 5000 dx-check-box — 1,6 с (docs/measurements.md).
 */
@Component({
  selector: 'app-dependent-multi-checkbox-filter',
  templateUrl: './dependent-multi-checkbox-filter.component.html',
  styleUrls: ['./dependent-multi-checkbox-filter.component.css'],
})
export class DependentMultiCheckboxFilterComponent
  implements OnChanges, OnDestroy
{
  @Input() field = '';
  @Input() filter: FilterExpression | null = null;
  @Input() selected?: FilterValue[];
  @Output() selectedChange = new EventEmitter<FilterValue[] | undefined>();

  @ViewChild('viewport') viewport?: ElementRef<HTMLElement>;

  model = new DependentListModel();
  loading = false;
  error: string | null = null;
  readonly rowHeight = ROW_HEIGHT_PX;
  readonly viewportHeight = ROW_HEIGHT_PX * VIEWPORT_ROWS;
  firstRow = 0;

  private search = '';
  private readonly searchInput = new Subject<string>();
  private readonly searchSubscription: Subscription;
  private request: Subscription | null = null;
  private readonly texts = new Map<FilterValue, string>();

  constructor(private readonly data: DataService) {
    this.searchSubscription = this.searchInput
      .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged())
      .subscribe((search) => {
        this.search = search;
        this.load();
      });
  }

  get visibleItems(): DistinctItem[] {
    return this.model.items.slice(
      this.firstRow,
      this.firstRow + VIEWPORT_ROWS + OVERSCAN_ROWS
    );
  }

  get truncatedNote(): string {
    return `Показаны первые ${this.model.items.length}, уточните поиском`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.field || changes.selected) {
      this.model = new DependentListModel(this.selected ?? []);
    }
    if (changes.field || changes.filter) {
      this.load();
    }
  }

  ngOnDestroy(): void {
    this.searchSubscription.unsubscribe();
    this.request?.unsubscribe();
  }

  /** Отображаемый текст значения из любого полученного ответа. */
  textOf(value: FilterValue): string | undefined {
    return this.texts.get(value);
  }

  trackByValue(_: number, item: DistinctItem): FilterValue {
    return item.value;
  }

  onSearchChange(value: string | null | undefined): void {
    this.searchInput.next(value ?? '');
  }

  onScroll(event: Event): void {
    const top = (event.target as HTMLElement).scrollTop;
    this.firstRow = Math.floor(top / ROW_HEIGHT_PX);
  }

  /** Привязка `[value]` возвращает своё же значение через valueChange — такие события пропускаются. */
  onToggle(value: FilterValue, checked: boolean | null | undefined): void {
    if (Boolean(checked) === this.model.isSelected(value)) {
      return;
    }
    this.model.toggle(value);
    this.selectedChange.emit(this.model.toValues());
  }

  onSelectAll(checked: boolean | null | undefined): void {
    if (Boolean(checked) === this.model.allSelected) {
      return;
    }
    if (checked) {
      this.model.selectAll();
    } else {
      this.model.clear();
    }
    this.selectedChange.emit(this.model.toValues());
  }

  /**
   * Новый запрос подписывается до отписки от старого: DataService сам
   * отменяет предыдущий запрос группы и считает его отменённым; наша отписка
   * после этого лишь освобождает подписчика, который иначе не завершится.
   */
  private load(): void {
    const requestId = this.model.nextRequestId();
    this.loading = true;
    this.error = null;
    const previous = this.request;
    this.request = this.data
      .distinct(this.field, this.filter, this.search || undefined)
      .subscribe({
        next: (result) => {
          this.model.applyResponse(requestId, result);
          result.items.forEach((item) => this.texts.set(item.value, item.text));
          this.loading = false;
          this.scrollToTop();
        },
        error: (e: Error) => {
          this.loading = false;
          this.error = e.message;
        },
      });
    previous?.unsubscribe();
  }

  private scrollToTop(): void {
    this.firstRow = 0;
    if (this.viewport !== undefined) {
      this.viewport.nativeElement.scrollTop = 0;
    }
  }
}

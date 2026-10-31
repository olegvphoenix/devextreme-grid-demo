import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { DxDataGridComponent } from 'devextreme-angular/ui/data-grid';
import {
  ColumnChooser,
  ColumnFixing,
  ColumnResizeMode,
  FilterRow,
  HeaderFilter,
  LoadPanel,
  Pager,
  Sorting,
  StateStoring,
} from 'devextreme/common/grids';
import DataSource from 'devextreme/data/data_source';
import {
  ContentReadyEvent,
  FilterPanel,
  OptionChangedEvent,
  Paging,
  Properties,
  Scrolling,
} from 'devextreme/ui/data_grid';
import { Subscription } from 'rxjs';

import { ApiError } from '../../core/api-error';
import { DataService } from '../../core/data.service';
import { DemoFlagsService } from '../../core/demo-flags.service';
import { GridMetricsService } from '../../core/grid-metrics.service';
import { StorageService } from '../../core/storage.service';
import {
  FilterExpression,
  GridFilterState,
} from '../../models/column-filter.model';
import { DATASET_SIZES, DatasetSize } from '../../models/dataset.model';
import { ProductionRecord } from '../../models/production-record.model';
import { DATE_SERIALIZATION_FORMAT } from '../../shared/date-format';
import {
  ColumnFilterApply,
  FilterColumn,
} from '../../shared/filters/column-filter-popup.component';
import {
  buildFilterExpression,
  isColumnFilterActive,
} from '../../shared/filters/filter-expression';
import {
  defaultScrollWidths,
  DxColumn,
  GRID_COLUMNS,
  GridColumnDef,
  toDxColumns,
} from './grid-columns';
import { GridFilterStateService } from './grid-filter-state.service';
import {
  attachWidths,
  detachWidths,
  DxGridState,
  GridPageSettings,
  readGridState,
  readPageSettings,
  readScrollWidths,
  saveGridState,
  savePageSettings,
  saveScrollWidths,
  WidthMode,
} from './grid-state';
import { createGridStore } from './grid-store';

/** Задержка ответа сервера по переключателю «Задержка ответа». */
const DEMO_DELAY_MS = 1500;
const PAGE_SIZES = [20, 50, 100, 500];
const SORT_OPTION = /^columns\[\d+\]\.(sortOrder|sortIndex)$/;

interface WidthModeItem {
  value: WidthMode;
  text: string;
}

@Component({
  selector: 'app-grid',
  templateUrl: './grid.component.html',
  styleUrls: ['./grid.component.css'],
})
export class GridComponent implements OnInit, OnDestroy {
  @ViewChild(DxDataGridComponent) grid?: DxDataGridComponent;

  readonly datasetSizes: DatasetSize[] = DATASET_SIZES;
  readonly widthModes: WidthModeItem[] = [
    { value: 'fit', text: 'По ширине страницы' },
    { value: 'scroll', text: 'С прокруткой' },
  ];
  readonly formatDataset = (size: DatasetSize): string =>
    size.toLocaleString('ru-RU');

  readonly dateSerializationFormat = DATE_SERIALIZATION_FORMAT;
  readonly filterColumns: GridColumnDef[] = GRID_COLUMNS;
  readonly remoteOperations: NonNullable<Properties['remoteOperations']> = {
    paging: true,
    sorting: true,
    filtering: true,
    grouping: true,
    summary: true,
    groupPaging: true,
  };
  readonly paging: Paging = { enabled: true, pageSize: PAGE_SIZES[0] };
  readonly pager: Pager = {
    visible: true,
    showPageSizeSelector: true,
    allowedPageSizes: PAGE_SIZES,
    showInfo: true,
    showNavigationButtons: true,
  };
  readonly scrolling: Scrolling = { mode: 'standard', useNative: true };
  readonly columnFixing: ColumnFixing = { enabled: true };
  readonly columnChooser: ColumnChooser = { enabled: true, mode: 'select' };
  readonly sorting: Sorting = { mode: 'multiple' };
  readonly filterPanel: FilterPanel = { visible: false };
  readonly headerFilter: HeaderFilter = { visible: false };
  readonly filterRow: FilterRow = { visible: false };
  readonly loadPanel: LoadPanel = { enabled: true };
  readonly stateStoring: StateStoring = {
    enabled: true,
    type: 'custom',
    savingTimeout: 0,
    customLoad: () => Promise.resolve(this.initialState()),
    customSave: (state: DxGridState) => this.saveState(state),
  };

  settings: GridPageSettings;
  columns: DxColumn[] = [];
  dataSource: DataSource<ProductionRecord, number>;
  error: string | null = null;

  filterState: GridFilterState;
  filterValue: FilterExpression | null;
  filterColumn: FilterColumn | null = null;
  filterTarget: HTMLElement | null = null;
  filterVisible = false;

  private readonly filterSubscription: Subscription;
  private stopFps: (() => void) | null = null;
  private resetting = false;

  constructor(
    private readonly data: DataService,
    private readonly storage: StorageService,
    private readonly flags: DemoFlagsService,
    private readonly metrics: GridMetricsService,
    private readonly filters: GridFilterStateService
  ) {
    this.metrics.markStart('first-render');
    this.settings = readPageSettings(this.storage);
    this.filterState = this.filters.snapshot;
    this.filterValue = buildFilterExpression(this.filterState);
    this.filterSubscription = this.filters.state$.subscribe((state) => {
      this.filterState = state;
      this.filterValue = buildFilterExpression(state);
    });
    this.dataSource = new DataSource<ProductionRecord, number>({
      store: createGridStore(this.data, (e) => this.onLoadError(e)),
    });
    this.dataSource.on('changed', () => (this.error = null));
  }

  get columnResizingMode(): ColumnResizeMode {
    return this.settings.widthMode === 'fit' ? 'nextColumn' : 'widget';
  }

  get delayEnabled(): boolean {
    return this.flags.delayMs > 0;
  }

  get failEnabled(): boolean {
    return this.flags.fail;
  }

  ngOnInit(): void {
    this.data.dataset = this.settings.dataset;
    this.columns = toDxColumns(GRID_COLUMNS, this.settings.widthMode);
  }

  ngOnDestroy(): void {
    this.flushState();
    this.filterSubscription.unsubscribe();
    this.stopFps?.();
    this.dataSource.dispose();
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    this.flushState();
  }

  isFilterActive(field: string): boolean {
    return isColumnFilterActive(this.filterState[field]);
  }

  /** Клик по иконке в заголовке: не доходит до ячейки, иначе сработает сортировка. */
  openFilter(field: string, event: Event): void {
    event.stopPropagation();
    const column = GRID_COLUMNS.find((def) => def.field === field);
    if (column === undefined) {
      return;
    }
    this.filterColumn = column;
    this.filterTarget = event.currentTarget as HTMLElement;
    this.filterVisible = true;
  }

  onFilterApply(change: ColumnFilterApply): void {
    this.changeFilters(() => this.filters.set(change.field, change.value));
  }

  onFilterRemove(field: string): void {
    this.changeFilters(() => this.filters.set(field, null));
  }

  onFiltersClear(): void {
    this.changeFilters(() => this.filters.clearAll());
  }

  onContentReady(e: ContentReadyEvent): void {
    const loading = e.component.getDataSource()?.isLoading();
    if (loading || e.component.totalCount() < 0) {
      return;
    }
    this.metrics.markContentReady();
    if (this.stopFps === null) {
      this.stopFps = this.metrics.startFpsWhileScrolling(
        e.component.getScrollable().element()
      );
    }
  }

  onOptionChanged(e: OptionChangedEvent): void {
    if (SORT_OPTION.test(e.fullName)) {
      this.metrics.markStart('sort');
    }
  }

  onDatasetChange(size: DatasetSize): void {
    if (size === this.settings.dataset) {
      return;
    }
    this.updateSettings({ dataset: size });
    this.data.dataset = size;
    this.error = null;
    this.dataSource.pageIndex(0);
    this.grid?.instance.refresh();
  }

  onWidthModeChange(mode: WidthMode): void {
    if (mode === this.settings.widthMode) {
      return;
    }
    this.updateSettings({ widthMode: mode });
    const instance = this.grid?.instance;
    if (instance === undefined) {
      return;
    }
    const current: DxGridState = instance.state();
    if (mode === 'fit') {
      const { state, widths } = detachWidths(current);
      saveScrollWidths(this.storage, widths);
      instance.state(state);
    } else {
      const widths = {
        ...defaultScrollWidths(GRID_COLUMNS),
        ...readScrollWidths(this.storage),
      };
      instance.state(attachWidths(current, widths));
    }
  }

  onDelayChange(enabled: boolean): void {
    this.flags.delayMs = enabled ? DEMO_DELAY_MS : 0;
  }

  onFailChange(enabled: boolean): void {
    this.flags.fail = enabled;
  }

  onRetry(): void {
    this.error = null;
    this.grid?.instance.refresh();
  }

  /** Чистит все ключи приложения и перезагружает страницу: грид стартует с умолчаний. */
  onReset(): void {
    this.resetting = true;
    this.storage.clear();
    location.reload();
  }

  /**
   * Замер «Фильтрация» идёт от действия до onContentReady; если выражение не
   * изменилось, грид ничего не грузит и замер снимается.
   */
  private changeFilters(change: () => void): void {
    const before = JSON.stringify(this.filterValue);
    this.metrics.markStart('filter');
    change();
    if (JSON.stringify(this.filterValue) === before) {
      this.metrics.cancelPending();
    }
  }

  /** Сохранённое состояние грида плюс текущие фильтры: `applyState` ставит `filterValue` из него. */
  private initialState(): DxGridState {
    return { ...readGridState(this.storage), filterValue: this.filterValue };
  }

  private onLoadError(e: ApiError): void {
    this.error = e.message;
    this.metrics.cancelPending();
  }

  private saveState(state: DxGridState): void {
    if (!this.resetting) {
      saveGridState(this.storage, state);
    }
  }

  private flushState(): void {
    const instance = this.grid?.instance;
    if (instance !== undefined) {
      this.saveState(instance.state());
    }
  }

  private updateSettings(change: Partial<GridPageSettings>): void {
    this.settings = { ...this.settings, ...change };
    savePageSettings(this.storage, this.settings);
  }
}

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
import CustomStore from 'devextreme/data/custom_store';
import DataSource from 'devextreme/data/data_source';
import {
  CellClickEvent,
  CellPreparedEvent,
  ContentReadyEvent,
  FilterPanel,
  OptionChangedEvent,
  Paging,
  Properties,
  Scrolling,
  Selection,
  SelectionChangedEvent,
} from 'devextreme/ui/data_grid';
import notify from 'devextreme/ui/notify';
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
import { SelectionMode } from '../../models/selection-mode.model';
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
  CELL_FIELD_ATTR,
  cellOrder,
  CellSelection,
  gridSelection,
  isSelectableCell,
  SELECTED_CELL_CLASS,
  syncCellClasses,
} from './cell-selection';
import { selectionTable, toExcelText } from './clipboard-format';
import {
  ClipboardService,
  hasTextSelection,
  isCopyShortcut,
  isEditableTarget,
} from './clipboard.service';
import {
  actionsColumn,
  defaultScrollWidths,
  DxColumn,
  GRID_COLUMNS,
  GridColumnDef,
  RowAction,
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
const NOTIFY_SUCCESS_MS = 1500;
const NOTIFY_ERROR_MS = 3000;
/** Кнопки действий данные не меняют: только уведомление с id записи. */
const ROW_ACTION_TEXTS: Record<RowAction, (id: number) => string> = {
  open: (id) => `Открыть запись ${id}`,
  start: (id) => `Запись ${id} передана в работу`,
  close: (id) => `Запись ${id} закрыта`,
};

interface WidthModeItem {
  value: WidthMode;
  text: string;
}

interface SelectionModeItem {
  value: SelectionMode;
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
  readonly selectionModes: SelectionModeItem[] = [
    { value: 'none', text: 'Отключено' },
    { value: 'row', text: 'Строка' },
    { value: 'multi-checkbox', text: 'Несколько строк, чекбоксы' },
    { value: 'multi-plain', text: 'Несколько строк без чекбоксов' },
    { value: 'cells', text: 'Ячейки' },
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
  selection: Selection;
  selectedRowCount = 0;
  readonly cells = new CellSelection();

  filterState: GridFilterState;
  filterValue: FilterExpression | null;
  filterColumn: FilterColumn | null = null;
  filterTarget: HTMLElement | null = null;
  filterVisible = false;

  private readonly store: CustomStore<ProductionRecord, number>;
  private readonly filterSubscription: Subscription;
  private stopFps: (() => void) | null = null;
  private resetting = false;

  constructor(
    private readonly data: DataService,
    private readonly storage: StorageService,
    private readonly flags: DemoFlagsService,
    private readonly metrics: GridMetricsService,
    private readonly filters: GridFilterStateService,
    private readonly clipboard: ClipboardService
  ) {
    this.metrics.markStart('first-render');
    this.settings = readPageSettings(this.storage);
    this.selection = gridSelection(this.settings.selectionMode);
    this.filterState = this.filters.snapshot;
    this.filterValue = buildFilterExpression(this.filterState);
    this.filterSubscription = this.filters.state$.subscribe((state) => {
      this.filterState = state;
      this.filterValue = buildFilterExpression(state);
    });
    this.store = createGridStore(this.data, (e) => this.onLoadError(e));
    this.dataSource = new DataSource<ProductionRecord, number>({
      store: this.store,
    });
    /** `push` строки приходит с `changes`: это не перезагрузка, выделение остаётся. */
    this.dataSource.on('changed', (e?: { changes?: unknown }) => {
      if (e?.changes !== undefined) {
        return;
      }
      this.error = null;
      this.cells.clear();
    });
  }

  get cellsMode(): boolean {
    return this.settings.selectionMode === 'cells';
  }

  get copyEnabled(): boolean {
    return this.cellsMode ? this.cells.count > 0 : this.selectedRowCount > 0;
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
    this.columns = [
      ...toDxColumns(GRID_COLUMNS, this.settings.widthMode),
      actionsColumn((action, id) => this.onRowAction(action, id)),
    ];
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
    this.selectedRowCount = e.component.getSelectedRowKeys().length;
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

  /** Смена режима сбрасывает и выбор строк грида, и своё выделение ячеек. */
  onSelectionModeChange(mode: SelectionMode): void {
    if (mode === this.settings.selectionMode) {
      return;
    }
    this.updateSettings({ selectionMode: mode });
    this.selection = gridSelection(mode);
    const previous = this.cells.cells;
    this.cells.clear();
    this.selectedRowCount = 0;
    const instance = this.grid?.instance;
    if (instance !== undefined) {
      instance.clearSelection();
      syncCellClasses(instance, previous, this.cells);
    }
  }

  onSelectionChanged(e: SelectionChangedEvent): void {
    this.selectedRowCount = e.selectedRowKeys.length;
  }

  onCellClick(e: CellClickEvent<ProductionRecord, number>): void {
    if (!this.cellsMode || !isSelectableCell(e.rowType, e.column)) {
      return;
    }
    const previous = this.cells.cells;
    const mods = {
      ctrl: e.event?.ctrlKey === true || e.event?.metaKey === true,
      shift: e.event?.shiftKey === true,
    };
    this.cells.click(
      { rowKey: e.key, field: e.column.dataField },
      mods,
      cellOrder(e.component)
    );
    syncCellClasses(e.component, previous, this.cells);
  }

  /** Грид перерисовывает ячейки при прокрутке и ресайзе: класс ставится при каждой отрисовке. */
  onCellPrepared(e: CellPreparedEvent<ProductionRecord, number>): void {
    if (!isSelectableCell(e.rowType, e.column)) {
      return;
    }
    e.cellElement.setAttribute(CELL_FIELD_ATTR, e.column.dataField);
    if (this.cellsMode) {
      e.cellElement.classList.toggle(
        SELECTED_CELL_CLASS,
        this.cells.has({ rowKey: e.key, field: e.column.dataField })
      );
    }
  }

  onCopy(): void {
    void this.copySelection();
  }

  onRowAction(action: RowAction, id: number): void {
    notify(ROW_ACTION_TEXTS[action](id), 'info', NOTIFY_SUCCESS_MS);
  }

  /**
   * Сохранённые ярлыки попадают в строку через `push`: грид перерисовывает
   * одну строку без запроса, страница и выбор остаются. `labelsKey` в строке
   * не обновляется — клиент его не читает, фильтр по нему считает сервер.
   */
  onLabelsChange(id: number, labels: string[]): void {
    this.store.push([{ type: 'update', key: id, data: { labels } }]);
  }

  /** Ctrl+C внутри грида; текст в поле ввода или выделенный мышью копируется штатно. */
  onGridKeyDown(event: KeyboardEvent): void {
    if (
      !isCopyShortcut(event) ||
      !this.copyEnabled ||
      isEditableTarget(event.target) ||
      hasTextSelection()
    ) {
      return;
    }
    event.preventDefault();
    void this.copySelection();
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

  private async copySelection(): Promise<void> {
    const instance = this.grid?.instance;
    if (instance === undefined) {
      return;
    }
    const table = selectionTable(instance, this.cellsMode ? this.cells : null);
    if (table === null) {
      notify(
        'Данные части выбранных строк ещё не загружены, повторите позже',
        'warning',
        NOTIFY_ERROR_MS
      );
      return;
    }
    try {
      await this.clipboard.copy(toExcelText(table.header, table.rows));
      notify(
        `Скопировано строк: ${table.rows.length}`,
        'success',
        NOTIFY_SUCCESS_MS
      );
    } catch {
      notify('Не удалось скопировать в буфер обмена', 'error', NOTIFY_ERROR_MS);
    }
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

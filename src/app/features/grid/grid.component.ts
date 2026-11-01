import {
  AfterViewInit,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
import dxDataGrid, {
  CellClickEvent,
  CellPreparedEvent,
  ContentReadyEvent,
  FilterPanel,
  Grouping,
  GroupPanel,
  OptionChangedEvent,
  Paging,
  Properties,
  Scrolling,
  Selection,
  SelectionChangedEvent,
  Summary,
} from 'devextreme/ui/data_grid';
import { confirm } from 'devextreme/ui/dialog';
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
import { scrollToAnchor } from '../../shared/scroll-to-anchor';
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
  buildExportRequest,
  estimatePdfPages,
  exportFileName,
  ExportKind,
  ExportSource,
  PDF_CONFIRM_ROWS,
} from './export-request';
import {
  actionsColumn,
  defaultFitWidths,
  defaultScrollWidths,
  DxColumn,
  GRID_COLUMNS,
  GRID_SUMMARY,
  GridColumnDef,
  RowAction,
  toDxColumns,
} from './grid-columns';
import { GridFilterStateService } from './grid-filter-state.service';
import {
  attachWidths,
  detachWidths,
  fillMissingWidths,
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
import { createGridStore, LoadScope } from './grid-store';
import { exportGridToExcel, exportGridToPdf, saveBlob } from './native-export';

/** Задержка ответа сервера по переключателю «Задержка ответа». */
const DEMO_DELAY_MS = 1500;
const PAGE_SIZES = [20, 50, 100, 500];
const DEFAULT_PAGE_SIZE = 50;
const SORT_OPTION = /^columns\[\d+\]\.(sortOrder|sortIndex)$/;
const NOTIFY_SUCCESS_MS = 1500;
const NOTIFY_LONG_MS = 3000;
/** Кнопки действий данные не меняют: только уведомление с id записи. */
const ROW_ACTION_TEXTS: Record<RowAction, (id: number) => string> = {
  open: (id) => `Открыть запись ${id}`,
  start: (id) => `Запись ${id} передана в работу`,
  close: (id) => `Запись ${id} закрыта`,
};

const EXPORT_KIND_TEXTS: Record<ExportKind, string> = {
  xlsx: 'Excel',
  pdf: 'PDF',
};
const EXPORT_SOURCE_TEXTS: Record<ExportSource, string> = {
  server: 'сервер',
  grid: 'штатно',
};

interface WidthModeItem {
  value: WidthMode;
  text: string;
}

interface ExportJob {
  source: ExportSource;
  kind: ExportKind;
  startedAt: number;
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
export class GridComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(DxDataGridComponent) grid?: DxDataGridComponent;

  readonly datasetSizes: DatasetSize[] = DATASET_SIZES;
  readonly widthModes: WidthModeItem[] = [
    { value: 'fit', text: 'По ширине' },
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

  readonly menuOptions = { width: 220 };
  readonly copyButtonAttr = { 'aria-label': 'Скопировать выделение' };

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
  readonly paging: Paging = { enabled: true, pageSize: DEFAULT_PAGE_SIZE };
  readonly pager: Pager = {
    visible: true,
    showPageSizeSelector: true,
    allowedPageSizes: PAGE_SIZES,
    showInfo: true,
    showNavigationButtons: true,
  };
  readonly scrolling: Scrolling = { mode: 'standard', useNative: true };
  readonly columnFixing: ColumnFixing = { enabled: true };
  readonly columnMinWidth = 40;
  readonly columnChooser: ColumnChooser = { enabled: true, mode: 'select' };
  readonly sorting: Sorting = { mode: 'multiple' };
  readonly filterPanel: FilterPanel = { visible: false };
  readonly headerFilter: HeaderFilter = { visible: false };
  readonly filterRow: FilterRow = { visible: false };
  readonly loadPanel: LoadPanel = { enabled: true };
  readonly groupPanel: GroupPanel = {
    visible: true,
    allowColumnDragging: true,
    emptyPanelText: 'Перетащите сюда заголовок колонки, чтобы сгруппировать',
  };
  readonly grouping: Grouping = {
    autoExpandAll: false,
    allowCollapsing: true,
    contextMenuEnabled: true,
  };
  readonly summary: Summary = GRID_SUMMARY;
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

  exporting: ExportJob | null = null;

  private readonly store: CustomStore<ProductionRecord, number>;
  private readonly filterSubscription: Subscription;
  private fragmentSubscription: Subscription | null = null;
  private stopFps: (() => void) | null = null;
  private resetting = false;
  private exportSubscription: Subscription | null = null;
  /** Ошибка загрузки всех строк штатным экспортом: он сам её не отдаёт и строит пустой файл. */
  private exportLoadError: ApiError | null = null;

  constructor(
    private readonly data: DataService,
    private readonly storage: StorageService,
    private readonly flags: DemoFlagsService,
    private readonly metrics: GridMetricsService,
    private readonly filters: GridFilterStateService,
    private readonly clipboard: ClipboardService,
    private readonly route: ActivatedRoute
  ) {
    this.metrics.markStart('first-render');
    this.settings = readPageSettings(this.storage);
    this.selection = gridSelection(this.settings.selectionMode);
    this.flags.reload();
    this.filters.reload();
    this.filterState = this.filters.snapshot;
    this.filterValue = buildFilterExpression(this.filterState);
    this.filterSubscription = this.filters.state$.subscribe((state) => {
      this.filterState = state;
      this.filterValue = buildFilterExpression(state);
    });
    this.store = createGridStore(this.data, (e, scope) =>
      this.onLoadError(e, scope)
    );
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

  get exportBusy(): boolean {
    return this.exporting !== null;
  }

  get exportingText(): string {
    if (this.exporting === null) {
      return '';
    }
    const kind = EXPORT_KIND_TEXTS[this.exporting.kind];
    const source = EXPORT_SOURCE_TEXTS[this.exporting.source];
    return `Экспорт ${kind} (${source})…`;
  }

  ngOnInit(): void {
    this.data.dataset = this.settings.dataset;
    this.columns = [
      ...toDxColumns(GRID_COLUMNS, this.settings.widthMode),
      actionsColumn((action, id) => this.onRowAction(action, id)),
    ];
  }

  /** Ссылки «Итогов» ведут на якоря разделов страницы: `/grid#export`. */
  ngAfterViewInit(): void {
    this.fragmentSubscription = this.route.fragment.subscribe((fragment) =>
      scrollToAnchor(fragment)
    );
  }

  ngOnDestroy(): void {
    this.flushState();
    this.filterSubscription.unsubscribe();
    this.fragmentSubscription?.unsubscribe();
    this.exportSubscription?.unsubscribe();
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
    this.grid?.instance.option('paging.pageIndex', 0);
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
      instance.state(attachWidths(state, defaultFitWidths(GRID_COLUMNS)));
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

  /**
   * Экспорт текущего вида: колонки, сортировка, группировка и фильтр страницы,
   * все строки под фильтром. Сервер строит файл по запросу страницы; штатный
   * путь — `exportDataGrid` поверх exceljs/jspdf, данные грид читает сам.
   * PDF от 100 000 строк запрашивает подтверждение с оценкой страниц.
   */
  async onExport(source: ExportSource, kind: ExportKind): Promise<void> {
    const instance = this.grid?.instance;
    if (instance === undefined || this.exporting !== null) {
      return;
    }
    const rows = instance.totalCount();
    if (kind === 'pdf' && rows >= PDF_CONFIRM_ROWS) {
      const pages = estimatePdfPages(rows).toLocaleString('ru-RU');
      const confirmed = await confirm(
        `Строк: ${rows.toLocaleString('ru-RU')}, страниц PDF: около ${pages}. ` +
          'Построение займёт десятки секунд. Продолжить?',
        'Экспорт в PDF'
      );
      if (!confirmed) {
        return;
      }
    }
    this.exporting = { source, kind, startedAt: performance.now() };
    this.exportLoadError = null;
    const fileName = exportFileName(source, kind, new Date());
    if (source === 'server') {
      this.exportFromServer(instance, kind, fileName);
    } else {
      await this.exportFromGrid(instance, kind, fileName);
    }
  }

  /** Отписка прерывает запрос: сервер проверяет `RequestAborted` между страницами PDF. */
  onExportCancel(): void {
    this.exportSubscription?.unsubscribe();
    this.exportSubscription = null;
    this.exporting = null;
    notify('Экспорт отменён', 'info', NOTIFY_SUCCESS_MS);
  }

  private exportFromServer(
    instance: dxDataGrid,
    kind: ExportKind,
    fileName: string
  ): void {
    const request = buildExportRequest(instance, this.filterValue);
    this.exportSubscription = this.data.exportFile(kind, request).subscribe({
      next: (blob) => {
        this.exportSubscription = null;
        saveBlob(blob, fileName).then(
          () => this.finishExport(fileName),
          (e: unknown) => this.finishExport(fileName, errorMessage(e))
        );
      },
      error: (e: ApiError) => {
        this.exportSubscription = null;
        this.finishExport(fileName, e.message);
      },
    });
  }

  private async exportFromGrid(
    instance: dxDataGrid,
    kind: ExportKind,
    fileName: string
  ): Promise<void> {
    try {
      const blob =
        kind === 'xlsx'
          ? await exportGridToExcel(instance)
          : await exportGridToPdf(instance);
      if (this.exportLoadError !== null) {
        this.finishExport(fileName, this.exportLoadError.message);
        return;
      }
      await saveBlob(blob, fileName);
      this.finishExport(fileName);
    } catch (e) {
      this.finishExport(fileName, errorMessage(e));
    }
  }

  private finishExport(fileName: string, error?: string): void {
    const startedAt = this.exporting?.startedAt ?? performance.now();
    this.exporting = null;
    const seconds = ((performance.now() - startedAt) / 1000).toLocaleString(
      'ru-RU',
      { maximumFractionDigits: 1 }
    );
    if (error === undefined) {
      notify(`${fileName} сохранён за ${seconds} с`, 'success', NOTIFY_LONG_MS);
    } else {
      notify(`Экспорт не выполнен: ${error}`, 'error', NOTIFY_LONG_MS);
    }
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
        NOTIFY_LONG_MS
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
      notify('Не удалось скопировать в буфер обмена', 'error', NOTIFY_LONG_MS);
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
    const stored = readGridState(this.storage);
    const state =
      stored !== null && this.settings.widthMode === 'fit'
        ? fillMissingWidths(stored, defaultFitWidths(GRID_COLUMNS))
        : stored;
    return { ...state, filterValue: this.filterValue };
  }

  /** Сбой загрузки всех строк во время штатного экспорта — ошибка экспорта, не полоска грида. */
  private onLoadError(e: ApiError, scope: LoadScope): void {
    if (scope === 'all' && this.exporting?.source === 'grid') {
      this.exportLoadError = e;
      return;
    }
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

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

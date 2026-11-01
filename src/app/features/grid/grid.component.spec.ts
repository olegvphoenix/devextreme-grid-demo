import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { DxDataGridComponent } from 'devextreme-angular/ui/data-grid';
import Toast from 'devextreme/ui/toast';
import { of } from 'rxjs';

import { ApiError } from '../../core/api-error';
import { ClipboardService } from './clipboard.service';
import { DataService } from '../../core/data.service';
import { DemoFlagsService } from '../../core/demo-flags.service';
import { GridMetricsService } from '../../core/grid-metrics.service';
import { StorageService } from '../../core/storage.service';
import { DataServiceStub } from '../../shared/filters/testing/data-service.stub';
import { GridComponent } from './grid.component';
import { GridFilterStateService } from './grid-filter-state.service';

/** `toEqual` над рекурсивным FilterExpression не типизируется (TS2589), сравниваем как unknown. */
const plain = (value: unknown): unknown => value;

/** Ждёт условие с опросом: сохранение файла идёт через динамический импорт. */
async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = performance.now();
  while (!condition()) {
    if (performance.now() - started > timeoutMs) {
      throw new Error('условие не наступило');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('GridComponent', () => {
  let component: GridComponent;
  let data: DataServiceStub;
  let instance: {
    option: jasmine.Spy;
    refresh: jasmine.Spy;
    state: jasmine.Spy;
    totalCount: jasmine.Spy;
    columnOption: jasmine.Spy;
  };

  const create = (): GridComponent => {
    const created = new GridComponent(
      TestBed.inject(DataService),
      TestBed.inject(StorageService),
      TestBed.inject(DemoFlagsService),
      TestBed.inject(GridMetricsService),
      TestBed.inject(GridFilterStateService),
      TestBed.inject(ClipboardService),
      TestBed.inject(ActivatedRoute)
    );
    created.grid = { instance } as unknown as DxDataGridComponent;
    return created;
  };
  const toastText = (): string =>
    Array.from(document.body.querySelectorAll('.dx-toast-message'))
      .map((e) => e.textContent!.trim())
      .join('\n');

  beforeEach(() => {
    localStorage.clear();
    data = new DataServiceStub();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: ActivatedRoute, useValue: { fragment: of(null) } },
        { provide: DataService, useValue: data },
      ],
    });
    instance = {
      option: jasmine.createSpy('option'),
      refresh: jasmine.createSpy('refresh'),
      state: jasmine.createSpy('state').and.returnValue({
        columns: [{ dataField: 'id', visibleIndex: 0, visible: true }],
      }),
      totalCount: jasmine.createSpy('totalCount').and.returnValue(1000),
      columnOption: jasmine
        .createSpy('columnOption')
        .and.callFake((_field: string, name: string) =>
          name === 'caption' ? 'ID' : undefined
        ),
    };
    component = create();
  });

  afterEach(() => {
    component.ngOnDestroy();
    localStorage.clear();
    document.body
      .querySelectorAll('.dx-toast')
      .forEach((toast) => Toast.getInstance(toast)?.dispose());
  });

  it('opening the page takes the filters from storage, not from the previous visit', () => {
    component.onFilterApply({ field: 'plant', value: { values: ['Завод Юг'] } });
    localStorage.removeItem('dxgrid-demo:filters');

    const reopened = create();

    expect(reopened.filterState).toEqual({});
    expect(reopened.filterValue).toBeNull();
    reopened.ngOnDestroy();
  });

  it('opening the page takes the demo flags from storage, not from the previous visit', () => {
    component.onDelayChange(true);
    component.onFailChange(true);
    localStorage.removeItem('dxgrid-demo:demo-flags');

    const reopened = create();

    expect(reopened.delayEnabled).toBeFalse();
    expect(reopened.failEnabled).toBeFalse();
    reopened.ngOnDestroy();
  });

  it('switching the dataset returns the grid, not only its data source, to the first page', () => {
    component.dataSource.pageIndex(3);

    component.onDatasetChange(100000);

    expect(component.dataSource.pageIndex()).toBe(0);
    expect(instance.option).toHaveBeenCalledWith('paging.pageIndex', 0);
    expect(instance.refresh).toHaveBeenCalled();
  });

  describe('export flow', () => {
    it('server export: the request is built from the grid view, the file is saved and the indicator goes away', async () => {
      spyOn(URL, 'createObjectURL').and.returnValue('blob:test');
      spyOn(URL, 'revokeObjectURL');

      await component.onExport('server', 'xlsx');

      expect(component.exportBusy).toBeTrue();
      expect(component.exportingText).toBe('Экспорт Excel (сервер)…');
      expect(plain(data.exportCalls)).toEqual([
        {
          kind: 'xlsx',
          request: { columns: [{ field: 'id', caption: 'ID' }], filter: null },
        },
      ]);

      data.respondExport(new Blob(['x']));
      await until(() => !component.exportBusy);

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(toastText()).toMatch(/^server-export-.+\.xlsx сохранён за /);
    });

    it('cancel unsubscribes the request, drops the indicator and tells the user', async () => {
      await component.onExport('server', 'pdf');
      expect(data.isExportPending()).toBeTrue();

      component.onExportCancel();

      expect(component.exportBusy).toBeFalse();
      expect(data.isExportPending()).toBeFalse();
      expect(toastText()).toContain('Экспорт отменён');
    });

    it('server error ends the export with the server text and saves nothing', async () => {
      spyOn(URL, 'createObjectURL');
      await component.onExport('server', 'xlsx');

      data.failExport(429, 'Сервер занят');

      expect(component.exportBusy).toBeFalse();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(toastText()).toContain('Экспорт не выполнен: Сервер занят');
    });

    it('a load error of all rows during a stock export is kept for the export, not shown as the grid error', () => {
      component.exporting = { source: 'grid', kind: 'xlsx', startedAt: 0 };
      component['onLoadError'](new ApiError(429, 'Сервер занят'), 'all');
      expect(component.error).toBeNull();

      component.exporting = null;
      component['onLoadError'](new ApiError(429, 'Сервер занят'), 'all');
      expect(component.error).toBe('Сервер занят');
    });
  });
});

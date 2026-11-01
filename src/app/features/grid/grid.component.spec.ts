import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { DxDataGridComponent } from 'devextreme-angular/ui/data-grid';
import { of } from 'rxjs';

import { ClipboardService } from './clipboard.service';
import { DataService } from '../../core/data.service';
import { DemoFlagsService } from '../../core/demo-flags.service';
import { GridMetricsService } from '../../core/grid-metrics.service';
import { StorageService } from '../../core/storage.service';
import { GridComponent } from './grid.component';
import { GridFilterStateService } from './grid-filter-state.service';

describe('GridComponent', () => {
  let component: GridComponent;
  let instance: {
    option: jasmine.Spy;
    refresh: jasmine.Spy;
    state: jasmine.Spy;
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: ActivatedRoute, useValue: { fragment: of(null) } }],
    });
    component = new GridComponent(
      TestBed.inject(DataService),
      TestBed.inject(StorageService),
      TestBed.inject(DemoFlagsService),
      TestBed.inject(GridMetricsService),
      TestBed.inject(GridFilterStateService),
      TestBed.inject(ClipboardService),
      TestBed.inject(ActivatedRoute)
    );
    instance = {
      option: jasmine.createSpy('option'),
      refresh: jasmine.createSpy('refresh'),
      state: jasmine.createSpy('state').and.returnValue({}),
    };
    component.grid = { instance } as unknown as DxDataGridComponent;
  });

  afterEach(() => {
    component.ngOnDestroy();
    localStorage.clear();
  });

  it('opening the page takes the filters from storage, not from the previous visit', () => {
    component.onFilterApply({ field: 'plant', value: { values: ['Завод Юг'] } });
    localStorage.removeItem('dxgrid-demo:filters');

    const reopened = new GridComponent(
      TestBed.inject(DataService),
      TestBed.inject(StorageService),
      TestBed.inject(DemoFlagsService),
      TestBed.inject(GridMetricsService),
      TestBed.inject(GridFilterStateService),
      TestBed.inject(ClipboardService),
      TestBed.inject(ActivatedRoute)
    );
    reopened.grid = { instance } as unknown as DxDataGridComponent;

    expect(reopened.filterState).toEqual({});
    expect(reopened.filterValue).toBeNull();
    reopened.ngOnDestroy();
  });

  it('opening the page takes the demo flags from storage, not from the previous visit', () => {
    component.onDelayChange(true);
    component.onFailChange(true);
    localStorage.removeItem('dxgrid-demo:demo-flags');

    const reopened = new GridComponent(
      TestBed.inject(DataService),
      TestBed.inject(StorageService),
      TestBed.inject(DemoFlagsService),
      TestBed.inject(GridMetricsService),
      TestBed.inject(GridFilterStateService),
      TestBed.inject(ClipboardService),
      TestBed.inject(ActivatedRoute)
    );
    reopened.grid = { instance } as unknown as DxDataGridComponent;

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
});

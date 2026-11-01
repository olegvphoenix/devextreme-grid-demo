import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { LoadOptions, SummaryDescriptor } from 'devextreme/data';

import { ApiError } from '../../core/api-error';
import { DataService } from '../../core/data.service';
import { GridLoadResult } from '../../models/load-options.model';
import { ProductionRecord } from '../../models/production-record.model';
import { DataServiceStub } from '../../shared/filters/testing/data-service.stub';
import { createGridStore, LoadScope } from './grid-store';

function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function row(id: number): ProductionRecord {
  return {
    id,
    date: '2021-05-01',
    plant: 'Завод Юг',
    line: 'Линия 1',
    product: 'Продукт',
    batch: 'П-1',
    netWeight: 10.5,
    grossWeight: 11,
    qty: 3,
    markingCode: '01',
    ean13: '4600000000000',
    status: 1,
    operator: 'Оператор',
    labels: [],
    labelsKey: '',
  };
}

/** Грид шлёт count без selector; типы DevExtreme требуют selector всегда. */
const countSummary = {
  summaryType: 'count',
} as unknown as SummaryDescriptor<ProductionRecord>;

const page: GridLoadResult = {
  data: [row(1), row(2)],
  totalCount: 1000,
  groupCount: -1,
  summary: null,
};

describe('createGridStore', () => {
  let stub: DataServiceStub;
  let errors: ApiError[];

  function store() {
    return createGridStore(
      stub as unknown as DataService,
      (e) => errors.push(e)
    );
  }

  beforeEach(() => {
    stub = new DataServiceStub();
    errors = [];
  });

  it('ключ записи — id', () => {
    expect(store().key()).toBe('id');
  });

  it('load пробрасывает результат', async () => {
    const options: LoadOptions<ProductionRecord> = {
      skip: 20,
      take: 20,
      requireTotalCount: true,
      sort: [{ selector: 'date', desc: true }],
    };
    const loading = store().load(options);
    expect(plain(stub.lastQuery)).toEqual({
      skip: 20,
      take: 20,
      requireTotalCount: true,
      sort: [{ selector: 'date', desc: true }],
    });
    stub.respondQuery(page);
    const result = await loading;
    expect(plain(result)).toEqual({
      data: page.data,
      totalCount: 1000,
      groupCount: -1,
    });
    expect(errors).toEqual([]);
  });

  it('отменённый запрос не вызывает onError и не роняет promise', async () => {
    const grid = store();
    const first = grid.load({ skip: 0, take: 20 });
    const second = grid.load({ skip: 20, take: 20 });
    expect(stub.queryCalls.length).toBe(2);
    const firstResult = await first;
    expect(plain(firstResult)).toEqual({ data: [] });
    expect(errors).toEqual([]);

    stub.respondQuery(page);
    expect(plain(await second)).toEqual({
      data: page.data,
      totalCount: 1000,
      groupCount: -1,
    });
  });

  it('загрузка без take идёт через queryStandalone и не отменяет страницу', async () => {
    const grid = store();
    const pageLoad = grid.load({ skip: 0, take: 20, requireTotalCount: true });
    const allLoad = grid.load({
      sort: [{ selector: 'date', desc: true }],
      filter: ['status', '=', 1],
      requireTotalCount: false,
    });
    expect(stub.queryCalls.length).toBe(1);
    expect(stub.standaloneCalls.length).toBe(1);
    expect(plain(stub.lastStandalone)).toEqual({
      requireTotalCount: false,
      sort: [{ selector: 'date', desc: true }],
      filter: ['status', '=', 1],
    });

    stub.respondQuery(page);
    expect(plain(await pageLoad)).toEqual({
      data: page.data,
      totalCount: 1000,
      groupCount: -1,
    });
    stub.respondStandalone({
      data: [row(3)],
      totalCount: -1,
      groupCount: -1,
      summary: [3],
    });
    expect(plain(await allLoad)).toEqual({
      data: [row(3)],
      totalCount: -1,
      groupCount: -1,
      summary: [3],
    });
    expect(errors).toEqual([]);
  });

  it('пробы счётчика групп (take 1) идут вне группы отмены: параллельные пробы и страница живут вместе', async () => {
    const grid = store();
    const pageLoad = grid.load({ skip: 0, take: 20, requireGroupCount: true });
    const probeA = grid.load({
      skip: 0,
      take: 1,
      requireGroupCount: true,
      group: [{ selector: 'line' }],
      filter: ['plant', '=', 'Завод Восток'],
    });
    const probeB = grid.load({
      skip: 0,
      take: 1,
      requireGroupCount: true,
      group: [{ selector: 'plant' }],
      filter: ['plant', '<', 'Завод Восток'],
    });
    expect(stub.queryCalls.length).toBe(1);
    expect(stub.standaloneCalls.length).toBe(2);
    expect(stub.standaloneCalls.map((call) => call.take)).toEqual([1, 1]);

    const probeResult = { data: [], totalCount: -1, groupCount: 3, summary: null };
    stub.respondStandalone(probeResult, 0);
    stub.respondStandalone({ ...probeResult, groupCount: 1 }, 1);
    stub.respondQuery(page);
    expect(plain(await probeA)).toEqual({ data: [], totalCount: -1, groupCount: 3 });
    expect(plain(await probeB)).toEqual({ data: [], totalCount: -1, groupCount: 1 });
    expect(plain(await pageLoad)).toEqual({
      data: page.data,
      totalCount: 1000,
      groupCount: -1,
    });
    expect(errors).toEqual([]);
  });

  it('ошибка загрузки всех строк доходит до onError с областью all, а promise завершается пустым: exportDataGrid на отказе зависает', async () => {
    const scopes: LoadScope[] = [];
    const loading = createGridStore(stub as unknown as DataService, (e, scope) => {
      errors.push(e);
      scopes.push(scope);
    }).load({ sort: 'id' });
    stub.failStandalone('Сервер занят');
    expect(plain(await loading)).toEqual({ data: [] });
    expect(errors.map((e) => e.message)).toEqual(['Сервер занят']);
    expect(scopes).toEqual(['all']);
  });

  it('ошибка пробы отклоняет promise с областью probe', async () => {
    const scopes: LoadScope[] = [];
    const loading = createGridStore(stub as unknown as DataService, (e, scope) => {
      errors.push(e);
      scopes.push(scope);
    }).load({ skip: 0, take: 1, requireGroupCount: true });
    stub.failStandalone('Сбой сервера');
    let rejected: unknown;
    try {
      await loading;
    } catch (e) {
      rejected = e;
    }
    expect((rejected as ApiError).message).toBe('Сбой сервера');
    expect(scopes).toEqual(['probe']);
  });

  it('ошибка страницы вызывает onError с областью page и отклоняет promise', async () => {
    const scopes: LoadScope[] = [];
    const loading = createGridStore(stub as unknown as DataService, (e, scope) => {
      errors.push(e);
      scopes.push(scope);
    }).load({ take: 20 });
    stub.failQuery('Сбой сервера');
    let rejected: unknown;
    try {
      await loading;
    } catch (e) {
      rejected = e;
    }
    expect(rejected instanceof ApiError).toBeTrue();
    expect((rejected as ApiError).message).toBe('Сбой сервера');
    expect(errors.length).toBe(1);
    expect(errors[0]).toBe(rejected as ApiError);
    expect(scopes).toEqual(['page']);
  });

  it('totalCount и groupCount попадают в результат', async () => {
    const loading = store().load({
      take: 20,
      requireTotalCount: true,
      requireGroupCount: true,
      group: [{ selector: 'plant', isExpanded: false }],
      groupSummary: [countSummary],
      totalSummary: [{ selector: 'qty', summaryType: 'sum' }],
    });
    expect(plain(stub.lastQuery)).toEqual({
      take: 20,
      requireTotalCount: true,
      requireGroupCount: true,
      group: [{ selector: 'plant', isExpanded: false }],
      groupSummary: [{ summaryType: 'count' }],
      totalSummary: [{ selector: 'qty', summaryType: 'sum' }],
    });
    stub.respondQuery({
      data: [{ key: 'Завод Юг', items: null, count: 250, summary: [250] }],
      totalCount: 1000,
      groupCount: 4,
      summary: [123456],
    });
    expect(plain(await loading)).toEqual({
      data: [{ key: 'Завод Юг', items: null, count: 250, summary: [250] }],
      totalCount: 1000,
      groupCount: 4,
      summary: [123456],
    });
  });

  it('строковые селекторы сортировки и группировки приводятся к объектам', () => {
    store().load({
      take: 20,
      sort: 'date',
      group: 'plant',
      filter: ['id', '>', 5],
    });
    expect(plain(stub.lastQuery)).toEqual({
      take: 20,
      sort: [{ selector: 'date' }],
      group: [{ selector: 'plant' }],
      filter: ['id', '>', 5],
    });
  });

  it('null-фильтр и отсутствующие ключи не передаются', () => {
    store().load({ filter: null, skip: 0, take: 20 });
    expect(plain(stub.lastQuery)).toEqual({ skip: 0, take: 20 });
  });

  describe('с настоящим DataService', () => {
    let service: DataService;
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
      service = TestBed.inject(DataService);
      http = TestBed.inject(HttpTestingController);
    });

    it('запрос, отменённый новым запросом, завершает promise без onError', async () => {
      const grid = createGridStore(service, (e) => errors.push(e));
      const first = grid.load({ skip: 0, take: 20 });
      const second = grid.load({ skip: 20, take: 20 });
      const requests = http.match('/api/rows/query');
      expect(requests.length).toBe(2);
      expect(requests[0].cancelled).toBeTrue();
      expect(plain(await first)).toEqual({ data: [] });
      requests[1].flush(page);
      expect(plain(await second)).toEqual({
        data: page.data,
        totalCount: 1000,
        groupCount: -1,
      });
      expect(errors).toEqual([]);
    });

    it('загрузка всех строк не отменяется страницей и не отменяет её', async () => {
      const grid = createGridStore(service, (e) => errors.push(e));
      const pageLoad = grid.load({ skip: 0, take: 20 });
      const allLoad = grid.load({ sort: 'id' });
      const requests = http.match('/api/rows/query');
      expect(requests.length).toBe(2);
      expect(requests.map((request) => request.cancelled)).toEqual([
        false,
        false,
      ]);
      expect(
        new URLSearchParams(requests[1].request.body as string).has('take')
      ).toBeFalse();
      requests[0].flush(page);
      requests[1].flush({
        data: [row(3)],
        totalCount: -1,
        groupCount: -1,
        summary: null,
      });
      expect(plain(await pageLoad)).toEqual({
        data: page.data,
        totalCount: 1000,
        groupCount: -1,
      });
      expect(plain(await allLoad)).toEqual({
        data: [row(3)],
        totalCount: -1,
        groupCount: -1,
      });
      expect(errors).toEqual([]);
    });
  });
});

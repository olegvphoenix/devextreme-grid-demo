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
import { createGridStore } from './grid-store';

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

  it('ошибка вызывает onError и отклоняет promise', async () => {
    const loading = store().load({ take: 20 });
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
  });

  it('totalCount и groupCount попадают в результат', async () => {
    const loading = store().load({
      requireTotalCount: true,
      requireGroupCount: true,
      group: [{ selector: 'plant', isExpanded: false }],
      groupSummary: [countSummary],
      totalSummary: [{ selector: 'qty', summaryType: 'sum' }],
    });
    expect(plain(stub.lastQuery)).toEqual({
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
    store().load({ sort: 'date', group: 'plant', filter: ['id', '>', 5] });
    expect(plain(stub.lastQuery)).toEqual({
      sort: [{ selector: 'date' }],
      group: [{ selector: 'plant' }],
      filter: ['id', '>', 5],
    });
  });

  it('null-фильтр и отсутствующие ключи не передаются', () => {
    store().load({ filter: null, skip: 0 });
    expect(plain(stub.lastQuery)).toEqual({ skip: 0 });
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
  });
});

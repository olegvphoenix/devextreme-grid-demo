import { TestBed } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';

import { ApiError } from './api-error';
import { DataService } from './data.service';

function keysOf(body: URLSearchParams): string[] {
  const keys: string[] = [];
  body.forEach((_, key) => keys.push(key));
  return keys.sort();
}

describe('DataService', () => {
  let service: DataService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(DataService);
    http = TestBed.inject(HttpTestingController);
  });

  it('новый query отменяет предыдущий', () => {
    service.query({ take: 20 }).subscribe();
    const first = http.expectOne('/api/rows/query');
    service.query({ take: 20, skip: 20 }).subscribe();
    expect(first.cancelled).toBeTrue();
    http.expectOne('/api/rows/query');
  });

  it('отмена увеличивает счётчик', () => {
    let count = 0;
    service.cancelled$.subscribe((c) => (count = c));
    service.query({}).subscribe();
    service.query({}).subscribe();
    expect(count).toBe(1);
  });

  it('завершённый запрос не считается отменённым', () => {
    let count = -1;
    service.cancelled$.subscribe((c) => (count = c));
    service.query({}).subscribe();
    http
      .expectOne('/api/rows/query')
      .flush({ data: [], totalCount: 0, groupCount: -1, summary: [] });
    service.query({}).subscribe();
    expect(count).toBe(0);
  });

  it('отписка потребителя прерывает запрос без счётчика', () => {
    let count = -1;
    service.cancelled$.subscribe((c) => (count = c));
    const subscription = service.query({}).subscribe();
    subscription.unsubscribe();
    expect(http.expectOne('/api/rows/query').cancelled).toBeTrue();
    expect(count).toBe(0);
  });

  it('отправляет form-urlencoded c JSON-строками и dataset', () => {
    service.dataset = 100000;
    service
      .query({ skip: 0, take: 20, sort: [{ selector: 'date', desc: true }] })
      .subscribe();
    const req = http.expectOne('/api/rows/query');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Content-Type')).toContain(
      'application/x-www-form-urlencoded'
    );
    const body = new URLSearchParams(req.request.body);
    expect(body.get('dataset')).toBe('100000');
    expect(body.get('skip')).toBe('0');
    expect(body.get('take')).toBe('20');
    expect(JSON.parse(body.get('sort')!)).toEqual([
      { selector: 'date', desc: true },
    ]);
  });

  it('не отправляет отсутствующие ключи и dataset по умолчанию 1000', () => {
    service.query({ take: 50, filter: null }).subscribe();
    const body = new URLSearchParams(
      http.expectOne('/api/rows/query').request.body
    );
    expect(body.get('dataset')).toBe('1000');
    expect(keysOf(body)).toEqual(['dataset', 'take']);
  });

  it('передаёт фильтр, группировку и агрегаты как JSON', () => {
    service
      .query({
        requireTotalCount: true,
        requireGroupCount: true,
        filter: [['status', '=', 1], 'and', ['plant', '=', 'Завод Юг']],
        group: [{ selector: 'plant', isExpanded: false }],
        totalSummary: [{ selector: 'qty', summaryType: 'sum' }],
        groupSummary: [{ summaryType: 'count' }],
      })
      .subscribe();
    const body = new URLSearchParams(
      http.expectOne('/api/rows/query').request.body
    );
    expect(body.get('requireTotalCount')).toBe('true');
    expect(body.get('requireGroupCount')).toBe('true');
    expect(JSON.parse(body.get('filter')!)).toEqual([
      ['status', '=', 1],
      'and',
      ['plant', '=', 'Завод Юг'],
    ]);
    expect(JSON.parse(body.get('group')!)).toEqual([
      { selector: 'plant', isExpanded: false },
    ]);
    expect(JSON.parse(body.get('totalSummary')!)).toEqual([
      { selector: 'qty', summaryType: 'sum' },
    ]);
    expect(JSON.parse(body.get('groupSummary')!)).toEqual([
      { summaryType: 'count' },
    ]);
  });

  it('отдаёт ответ сервера и время ответа', () => {
    const times: number[] = [];
    service.responseMs$.subscribe((ms) => times.push(ms));
    let result: unknown;
    service.query({ take: 1 }).subscribe((r) => (result = r));
    const payload = {
      data: [{ id: 1 }],
      totalCount: 1000,
      groupCount: -1,
      summary: [],
    };
    http.expectOne('/api/rows/query').flush(payload);
    expect(result).toEqual(payload);
    expect(times.length).toBe(1);
    expect(times[0]).toBeGreaterThanOrEqual(0);
  });

  it('ошибка сервера превращается в ApiError с сообщением', () => {
    let error: ApiError | undefined;
    service.query({}).subscribe({ error: (e) => (error = e) });
    http
      .expectOne('/api/rows/query')
      .flush({ message: 'Сбой' }, { status: 500, statusText: 'Error' });
    expect(error instanceof ApiError).toBeTrue();
    expect(error!.message).toBe('Сбой');
    expect(error!.status).toBe(500);
  });

  it('ошибка без тела даёт ApiError со статусом в сообщении', () => {
    let error: ApiError | undefined;
    service.query({}).subscribe({ error: (e) => (error = e) });
    http
      .expectOne('/api/rows/query')
      .flush(null, { status: 429, statusText: 'Too Many Requests' });
    expect(error instanceof ApiError).toBeTrue();
    expect(error!.status).toBe(429);
    expect(error!.message).toBe('Ошибка 429');
  });

  it('обрыв связи (статус 0) даёт русское сообщение без statusText', () => {
    let error: ApiError | undefined;
    service.query({}).subscribe({ error: (e) => (error = e) });
    http
      .expectOne('/api/rows/query')
      .error(new ErrorEvent('network'), { status: 0, statusText: 'Unknown Error' });
    expect(error instanceof ApiError).toBeTrue();
    expect(error!.status).toBe(0);
    expect(error!.message).toBe('Нет связи с сервером');
  });

  it('запрос одной колонки distinct отменяет только свой предыдущий', () => {
    service.distinct('plant', null).subscribe();
    const a = http.expectOne('/api/distinct');
    service.stats('qty', null).subscribe();
    expect(a.cancelled).toBeFalse();
    service.distinct('plant', null).subscribe();
    expect(a.cancelled).toBeTrue();
  });

  it('distinct отправляет field, filter и search формой', () => {
    service.dataset = 1000000;
    service.distinct('line', [['plant', '=', 'Завод Юг']], 'лин').subscribe();
    const req = http.expectOne('/api/distinct');
    expect(req.request.method).toBe('POST');
    const body = new URLSearchParams(req.request.body);
    expect(body.get('dataset')).toBe('1000000');
    expect(body.get('field')).toBe('line');
    expect(JSON.parse(body.get('filter')!)).toEqual([
      ['plant', '=', 'Завод Юг'],
    ]);
    expect(body.get('search')).toBe('лин');
    expect(body.has('take')).toBeFalse();
  });

  it('distinct без фильтра и поиска шлёт только dataset и field', () => {
    service.distinct('status', null).subscribe();
    const body = new URLSearchParams(
      http.expectOne('/api/distinct').request.body
    );
    expect(keysOf(body)).toEqual(['dataset', 'field']);
  });

  it('stats отправляет field и filter и отдаёт min/max/count', () => {
    let result: unknown;
    service
      .stats('date', [['status', '=', 1]])
      .subscribe((r) => (result = r));
    const req = http.expectOne('/api/stats');
    const body = new URLSearchParams(req.request.body);
    expect(body.get('field')).toBe('date');
    expect(JSON.parse(body.get('filter')!)).toEqual([['status', '=', 1]]);
    const payload = { min: '2020-02-01', max: '2026-10-31', count: 250669 };
    req.flush(payload);
    expect(result).toEqual(payload);
  });

  it('новый stats отменяет предыдущий stats, но не query', () => {
    service.query({ take: 20 }).subscribe();
    const rows = http.expectOne('/api/rows/query');
    service.stats('qty', null).subscribe();
    const first = http.expectOne('/api/stats');
    service.stats('netWeight', null).subscribe();
    expect(first.cancelled).toBeTrue();
    expect(rows.cancelled).toBeFalse();
  });

  it('queryStandalone шлёт те же ключи вне группы rows, без take', () => {
    service.query({ take: 20 }).subscribe();
    const pageRequest = http.expectOne('/api/rows/query');
    let result: unknown;
    service
      .queryStandalone({
        requireTotalCount: false,
        sort: [{ selector: 'date', desc: true }],
        filter: ['status', '=', 1],
      })
      .subscribe((r) => (result = r));
    const requests = http.match('/api/rows/query');
    expect(requests.length).toBe(1);
    expect(pageRequest.cancelled).toBeFalse();
    const body = new URLSearchParams(requests[0].request.body);
    expect(keysOf(body)).toEqual([
      'dataset',
      'filter',
      'requireTotalCount',
      'sort',
    ]);
    expect(body.get('requireTotalCount')).toBe('false');

    service.query({ take: 20, skip: 20 }).subscribe();
    expect(pageRequest.cancelled).toBeTrue();
    expect(requests[0].cancelled).toBeFalse();

    const payload = { data: [], totalCount: -1, groupCount: -1, summary: null };
    requests[0].flush(payload);
    expect(result).toEqual(payload);
  });

  it('ошибка queryStandalone превращается в ApiError с сообщением сервера', () => {
    let error: ApiError | undefined;
    service.queryStandalone({}).subscribe({ error: (e) => (error = e) });
    http
      .expectOne('/api/rows/query')
      .flush(
        { message: 'Сервер занят' },
        { status: 429, statusText: 'Too Many Requests' }
      );
    expect(error instanceof ApiError).toBeTrue();
    expect(error!.status).toBe(429);
    expect(error!.message).toBe('Сервер занят');
  });

  it('updateLabels делает PUT с JSON и dataset в query string', () => {
    service.dataset = 100000;
    let result: unknown;
    service.updateLabels(7, ['срочно']).subscribe((r) => (result = r));
    const req = http.expectOne(
      (r) => r.url === '/api/rows/7/labels' && r.method === 'PUT'
    );
    expect(req.request.params.get('dataset')).toBe('100000');
    expect(req.request.body).toEqual({ labels: ['срочно'] });
    const record = { id: 7, labels: ['срочно'] };
    req.flush(record);
    expect(result).toEqual(record);
  });

  it('exportFile шлёт columns и форму и отдаёт Blob', () => {
    let blob: Blob | undefined;
    service
      .exportFile('xlsx', {
        columns: [{ field: 'id', caption: 'Идентификатор' }],
        sort: [{ selector: 'date', desc: true }],
        filter: [['status', '=', 1]],
      })
      .subscribe((b) => (blob = b));
    const req = http.expectOne('/api/export/xlsx');
    expect(req.request.method).toBe('POST');
    expect(req.request.responseType).toBe('blob');
    const body = new URLSearchParams(req.request.body);
    expect(body.get('dataset')).toBe('1000');
    expect(JSON.parse(body.get('columns')!)).toEqual([
      { field: 'id', caption: 'Идентификатор' },
    ]);
    expect(JSON.parse(body.get('sort')!)).toEqual([
      { selector: 'date', desc: true },
    ]);
    expect(JSON.parse(body.get('filter')!)).toEqual([['status', '=', 1]]);
    req.flush(new Blob(['x']));
    expect(blob instanceof Blob).toBeTrue();
  });

  it('экспорт не отменяет query и не отменяется новым query', () => {
    service.query({ take: 20 }).subscribe();
    const rows = http.expectOne('/api/rows/query');
    service.exportFile('pdf', { columns: [] }).subscribe();
    const pdf = http.expectOne('/api/export/pdf');
    expect(rows.cancelled).toBeFalse();
    service.query({ take: 20 }).subscribe();
    expect(pdf.cancelled).toBeFalse();
  });

  it('ошибка экспорта с Blob-телом читается в ApiError', async () => {
    const failed = new Promise<ApiError>((resolve) =>
      service
        .exportFile('xlsx', { columns: [] })
        .subscribe({ error: (e) => resolve(e) })
    );
    http
      .expectOne('/api/export/xlsx')
      .flush(new Blob([JSON.stringify({ message: 'Сервер занят' })]), {
        status: 429,
        statusText: 'Too Many Requests',
      });
    const error = await failed;
    expect(error instanceof ApiError).toBeTrue();
    expect(error.status).toBe(429);
    expect(error.message).toBe('Сервер занят');
  });
});

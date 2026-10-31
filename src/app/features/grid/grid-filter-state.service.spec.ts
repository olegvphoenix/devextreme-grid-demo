import { StorageService } from '../../core/storage.service';
import { GridFilterState } from '../../models/column-filter.model';
import { GridFilterStateService } from './grid-filter-state.service';

const KEY = 'dxgrid-demo:filters';

describe('GridFilterStateService', () => {
  let storage: StorageService;

  const stored = (): unknown => JSON.parse(localStorage.getItem(KEY) ?? 'null');
  const latest = (service: GridFilterStateService) => {
    const box: { value: GridFilterState | undefined } = { value: undefined };
    service.state$.subscribe((v) => (box.value = v));
    return box;
  };

  beforeEach(() => {
    localStorage.clear();
    storage = new StorageService();
  });

  afterEach(() => localStorage.clear());

  it('пустое хранилище даёт пустое состояние без записи', () => {
    const service = new GridFilterStateService(storage);
    expect(service.snapshot).toEqual({});
    expect(latest(service).value).toEqual({});
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('set пишет колонку в хранилище и в state$', () => {
    const service = new GridFilterStateService(storage);
    const state = latest(service);
    service.set('status', { values: [1, 2], texts: { '1': 'В работе' } });
    expect(stored()).toEqual({
      status: { values: [1, 2], texts: { '1': 'В работе' } },
    });
    expect(state.value).toEqual(service.snapshot);
    expect(service.snapshot.status.values).toEqual([1, 2]);

    service.set('date', { from: '2021-01-01', to: null });
    expect(Object.keys(service.snapshot)).toEqual(['status', 'date']);
    expect(stored()).toEqual(service.snapshot);
  });

  it('восстанавливает состояние из хранилища', () => {
    const saved: GridFilterState = {
      plant: { values: ['Завод Юг'], texts: { 'Завод Юг': 'Завод Юг' } },
      netWeight: { from: 10, to: 20 },
    };
    storage.write('filters', saved);
    const service = new GridFilterStateService(storage);
    expect(service.snapshot).toEqual(saved);
    expect(latest(service).value).toEqual(saved);
  });

  it('null снимает колонку, остальные остаются', () => {
    const service = new GridFilterStateService(storage);
    service.set('plant', { values: ['Завод Юг'] });
    service.set('status', { values: [1] });
    service.set('plant', null);
    expect(service.snapshot).toEqual({ status: { values: [1] } });
    expect(stored()).toEqual({ status: { values: [1] } });
    service.set('missing', null);
    expect(service.snapshot).toEqual({ status: { values: [1] } });
  });

  it('clearAll очищает всё и пишет пустой объект', () => {
    const service = new GridFilterStateService(storage);
    service.set('plant', { values: ['Завод Юг'] });
    service.clearAll();
    expect(service.snapshot).toEqual({});
    expect(stored()).toEqual({});
    expect(latest(service).value).toEqual({});
  });

  it('set не мутирует прежний снимок', () => {
    const service = new GridFilterStateService(storage);
    service.set('plant', { values: ['Завод Юг'] });
    const before = service.snapshot;
    service.set('status', { values: [1] });
    expect(before).toEqual({ plant: { values: ['Завод Юг'] } });
    expect(service.snapshot).not.toBe(before);
  });

  it('мусор в хранилище даёт пустое состояние, кривые колонки отбрасываются', () => {
    localStorage.setItem(KEY, '[1,2]');
    expect(new GridFilterStateService(storage).snapshot).toEqual({});

    localStorage.setItem(KEY, '{broken');
    expect(new GridFilterStateService(storage).snapshot).toEqual({});

    localStorage.setItem(
      KEY,
      JSON.stringify({
        plant: { values: ['Завод Юг', 5], texts: { 'Завод Юг': 'Юг' } },
        status: 'не объект',
        date: { from: '2021-01-01', to: { bad: true }, values: 'x' },
        qty: { values: [1, null, 'a', true], texts: { '1': 2 } },
        empty: {},
      })
    );
    expect(new GridFilterStateService(storage).snapshot).toEqual({
      plant: { values: ['Завод Юг', 5], texts: { 'Завод Юг': 'Юг' } },
      date: { from: '2021-01-01' },
      qty: { values: [1, 'a'] },
    });
  });
});

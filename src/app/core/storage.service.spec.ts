import { StorageService } from './storage.service';

describe('StorageService', () => {
  let service: StorageService;
  const foreignKey = 'other-app:value';

  beforeEach(() => {
    localStorage.clear();
    service = new StorageService();
  });

  afterEach(() => localStorage.clear());

  it('хранит ключи с префиксом приложения', () => {
    service.write('state', { page: 2 });
    expect(localStorage.getItem('dxgrid-demo:state')).toBe('{"page":2}');
    expect(service.read('state', { page: 0 })).toEqual({ page: 2 });
  });

  it('отсутствующий ключ даёт fallback', () => {
    expect(service.read('missing', 'default')).toBe('default');
  });

  it('повреждённый JSON даёт fallback', () => {
    localStorage.setItem('dxgrid-demo:state', '{broken');
    expect(service.read('state', { page: 0 })).toEqual({ page: 0 });
  });

  it('remove удаляет только свой ключ', () => {
    service.write('a', 1);
    localStorage.setItem('a', 'foreign');
    service.remove('a');
    expect(localStorage.getItem('dxgrid-demo:a')).toBeNull();
    expect(localStorage.getItem('a')).toBe('foreign');
  });

  it('entries() не возвращает чужие ключи', () => {
    service.write('state', { page: 2 });
    service.write('filters', {});
    localStorage.setItem(foreignKey, '1');
    const entries = service.entries();
    expect(entries.map((e) => e.key).sort()).toEqual([
      'dxgrid-demo:filters',
      'dxgrid-demo:state',
    ]);
    expect(entries.find((e) => e.key === 'dxgrid-demo:state')!.value).toBe(
      '{"page":2}'
    );
  });

  it('clear() не трогает чужие ключи', () => {
    service.write('state', 1);
    service.write('filters', 2);
    localStorage.setItem(foreignKey, '1');
    service.clear();
    expect(service.entries()).toEqual([]);
    expect(localStorage.getItem(foreignKey)).toBe('1');
  });
});

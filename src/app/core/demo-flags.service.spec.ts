import { DemoFlags, DemoFlagsService } from './demo-flags.service';
import { StorageService } from './storage.service';

describe('DemoFlagsService', () => {
  let storage: StorageService;

  beforeEach(() => {
    localStorage.clear();
    storage = new StorageService();
  });

  afterEach(() => localStorage.clear());

  it('по умолчанию задержки и сбоя нет', () => {
    const flags = new DemoFlagsService(storage);
    expect(flags.delayMs).toBe(0);
    expect(flags.fail).toBeFalse();
  });

  it('сохраняет флаги под ключом demo-flags и восстанавливает их', () => {
    const flags = new DemoFlagsService(storage);
    flags.delayMs = 2000;
    flags.fail = true;
    expect(storage.read<DemoFlags | null>('demo-flags', null)).toEqual({
      delayMs: 2000,
      fail: true,
    });
    const restored = new DemoFlagsService(storage);
    expect(restored.delayMs).toBe(2000);
    expect(restored.fail).toBeTrue();
  });

  it('повреждённое хранилище даёт значения по умолчанию', () => {
    localStorage.setItem('dxgrid-demo:demo-flags', '{broken');
    const flags = new DemoFlagsService(storage);
    expect(flags.delayMs).toBe(0);
    expect(flags.fail).toBeFalse();
  });
});

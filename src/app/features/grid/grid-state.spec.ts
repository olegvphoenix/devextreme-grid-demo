import { StorageService } from '../../core/storage.service';
import {
  attachWidths,
  DEFAULT_PAGE_SETTINGS,
  detachWidths,
  DxGridState,
  readGridState,
  readPageSettings,
  readScrollWidths,
  saveGridState,
  savePageSettings,
  saveScrollWidths,
  stripVolatileState,
} from './grid-state';

function stateWith(
  columns: DxGridState['columns'],
  rest: Partial<DxGridState> = {}
): DxGridState {
  return { columns, pageIndex: 2, pageSize: 50, ...rest };
}

describe('grid-state', () => {
  describe('stripVolatileState', () => {
    it('вырезает filterValue и оставляет остальное', () => {
      const state = stateWith([{ dataField: 'id', visibleIndex: 0 }], {
        filterValue: ['status', '=', 1],
        selectedRowKeys: [1, 2],
      });
      const stripped = stripVolatileState(state);
      expect('filterValue' in stripped).toBeFalse();
      expect(stripped.columns).toEqual([{ dataField: 'id', visibleIndex: 0 }]);
      expect(stripped.pageIndex).toBe(2);
      expect(stripped.pageSize).toBe(50);
      expect(stripped.selectedRowKeys).toEqual([1, 2]);
    });

    it('не мутирует исходное состояние', () => {
      const state = stateWith([], { filterValue: ['id', '=', 1] });
      stripVolatileState(state);
      expect(state.filterValue).toEqual(['id', '=', 1]);
    });
  });

  describe('detachWidths / attachWidths', () => {
    const scrollState = stateWith([
      { dataField: 'id', width: 90, visibleIndex: 1 },
      { dataField: 'date', width: 120, visibleIndex: 0, sortOrder: 'desc' },
      { dataField: 'plant', visibleIndex: 2 },
    ]);

    it('detachWidths снимает ширины и отдаёт их по полю', () => {
      const { state, widths } = detachWidths(scrollState);
      expect(widths).toEqual({ id: 90, date: 120 });
      expect(state.columns!.map((c) => c.width)).toEqual([
        undefined,
        undefined,
        undefined,
      ]);
      expect(state.columns![1].sortOrder).toBe('desc');
      expect(state.columns![1].visibleIndex).toBe(0);
      expect(scrollState.columns![0].width).toBe(90);
    });

    it('detachWidths без колонок даёт пустые ширины', () => {
      const { state, widths } = detachWidths({ pageIndex: 0 });
      expect(widths).toEqual({});
      expect(state).toEqual({ pageIndex: 0 });
    });

    it('attachWidths возвращает отложенные ширины по полю', () => {
      const fitState = detachWidths(scrollState).state;
      const restored = attachWidths(fitState, { id: 90, date: 120 });
      expect(restored).toEqual(scrollState);
      expect(fitState.columns![0].width).toBeUndefined();
    });

    it('attachWidths не трогает колонки без отложенной ширины', () => {
      const restored = attachWidths(
        stateWith([{ dataField: 'id', width: 40 }, { dataField: 'plant' }]),
        { plant: 150 }
      );
      expect(restored.columns).toEqual([
        { dataField: 'id', width: 40 },
        { dataField: 'plant', width: 150 },
      ]);
    });
  });

  describe('хранилище', () => {
    let storage: StorageService;

    beforeEach(() => {
      localStorage.clear();
      storage = new StorageService();
    });

    afterEach(() => localStorage.clear());

    it('пустое хранилище даёт настройки по умолчанию', () => {
      expect(readPageSettings(storage)).toEqual(DEFAULT_PAGE_SETTINGS);
      expect(readGridState(storage)).toBeNull();
      expect(readScrollWidths(storage)).toEqual({});
    });

    it('мусор в хранилище даёт значения по умолчанию', () => {
      localStorage.setItem('dxgrid-demo:dataset', '5');
      localStorage.setItem('dxgrid-demo:width-mode', '"wide"');
      localStorage.setItem('dxgrid-demo:selection-mode', '42');
      localStorage.setItem('dxgrid-demo:state', '"not an object"');
      localStorage.setItem('dxgrid-demo:scroll-widths', '[1,2]');
      expect(readPageSettings(storage)).toEqual(DEFAULT_PAGE_SETTINGS);
      expect(readGridState(storage)).toBeNull();
      expect(readScrollWidths(storage)).toEqual({});
    });

    it('повреждённый JSON даёт значения по умолчанию', () => {
      localStorage.setItem('dxgrid-demo:dataset', '{broken');
      localStorage.setItem('dxgrid-demo:state', '{broken');
      expect(readPageSettings(storage)).toEqual(DEFAULT_PAGE_SETTINGS);
      expect(readGridState(storage)).toBeNull();
    });

    it('настройки страницы сохраняются по отдельным ключам и читаются', () => {
      savePageSettings(storage, {
        dataset: 1000000,
        widthMode: 'scroll',
        selectionMode: 'multi-checkbox',
      });
      expect(localStorage.getItem('dxgrid-demo:dataset')).toBe('1000000');
      expect(localStorage.getItem('dxgrid-demo:width-mode')).toBe('"scroll"');
      expect(localStorage.getItem('dxgrid-demo:selection-mode')).toBe(
        '"multi-checkbox"'
      );
      expect(readPageSettings(storage)).toEqual({
        dataset: 1000000,
        widthMode: 'scroll',
        selectionMode: 'multi-checkbox',
      });
    });

    it('частично верные настройки берут умолчание только для мусора', () => {
      localStorage.setItem('dxgrid-demo:dataset', '100000');
      localStorage.setItem('dxgrid-demo:width-mode', 'null');
      expect(readPageSettings(storage)).toEqual({
        ...DEFAULT_PAGE_SETTINGS,
        dataset: 100000,
      });
    });

    it('saveGridState вырезает filterValue, readGridState читает обратно', () => {
      saveGridState(
        storage,
        stateWith([{ dataField: 'id' }], { filterValue: ['id', '=', 1] })
      );
      const raw = JSON.parse(localStorage.getItem('dxgrid-demo:state')!);
      expect('filterValue' in raw).toBeFalse();
      expect(readGridState(storage)).toEqual(stateWith([{ dataField: 'id' }]));
    });

    it('ширины режима прокрутки откладываются и возвращаются', () => {
      saveScrollWidths(storage, { id: 90, date: 120 });
      expect(readScrollWidths(storage)).toEqual({ id: 90, date: 120 });
    });
  });
});

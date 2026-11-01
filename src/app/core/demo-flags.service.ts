import { Injectable } from '@angular/core';

import { StorageService } from './storage.service';

export interface DemoFlags {
  delayMs: number;
  fail: boolean;
}

const STORAGE_KEY = 'demo-flags';
const DEFAULT_FLAGS: DemoFlags = { delayMs: 0, fail: false };

/** Переключатели «Задержка ответа» и «Ошибка сервера», живут в localStorage. */
@Injectable({ providedIn: 'root' })
export class DemoFlagsService {
  private flags: DemoFlags;

  constructor(private readonly storage: StorageService) {
    this.flags = this.stored();
  }

  /** Страница настроек меняет хранилище мимо службы: при открытии грида флаги перечитываются. */
  reload(): void {
    this.flags = this.stored();
  }

  get delayMs(): number {
    return this.flags.delayMs;
  }

  set delayMs(value: number) {
    this.update({ delayMs: value });
  }

  get fail(): boolean {
    return this.flags.fail;
  }

  set fail(value: boolean) {
    this.update({ fail: value });
  }

  private stored(): DemoFlags {
    return {
      ...DEFAULT_FLAGS,
      ...this.storage.read<Partial<DemoFlags>>(STORAGE_KEY, {}),
    };
  }

  private update(change: Partial<DemoFlags>): void {
    this.flags = { ...this.flags, ...change };
    this.storage.write(STORAGE_KEY, this.flags);
  }
}

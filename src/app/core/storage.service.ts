import { Injectable } from '@angular/core';

export interface StorageEntry {
  key: string;
  value: string;
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  static readonly PREFIX = 'dxgrid-demo:';

  read<T>(key: string, fallback: T): T {
    const raw = localStorage.getItem(StorageService.PREFIX + key);
    if (raw === null) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  write<T>(key: string, value: T): void {
    localStorage.setItem(StorageService.PREFIX + key, JSON.stringify(value));
  }

  remove(key: string): void {
    localStorage.removeItem(StorageService.PREFIX + key);
  }

  entries(): StorageEntry[] {
    return this.ownKeys().map((key) => ({
      key,
      value: localStorage.getItem(key) ?? '',
    }));
  }

  clear(): void {
    this.ownKeys().forEach((key) => localStorage.removeItem(key));
  }

  private ownKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && key.startsWith(StorageService.PREFIX)) {
        keys.push(key);
      }
    }
    return keys;
  }
}

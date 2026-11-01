import { Component, OnInit } from '@angular/core';

import { StorageService } from '../../core/storage.service';

export interface SettingsRow {
  key: string;
  value: string;
}

/** Содержимое localStorage приложения как есть: ключи с префиксом и их значения. */
@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnInit {
  rows: SettingsRow[] = [];

  constructor(private readonly storage: StorageService) {}

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.rows = this.storage
      .entries()
      .map((entry) => ({ key: entry.key, value: formatValue(entry.value) }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  remove(key: string): void {
    this.storage.remove(key.slice(StorageService.PREFIX.length));
    this.refresh();
  }

  clear(): void {
    this.storage.clear();
    this.refresh();
  }

  trackByKey(_: number, row: SettingsRow): string {
    return row.key;
  }
}

/** JSON — с отступами; всё остальное (в том числе повреждённое) — как лежит. */
function formatValue(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

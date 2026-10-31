import { Component } from '@angular/core';

import { DATE_FORMAT } from '../../shared/date-format';

interface GridRow {
  id: number;
  name: string;
  date: Date;
}

@Component({
  selector: 'app-grid',
  templateUrl: './grid.component.html',
})
export class GridComponent {
  readonly dateFormat = DATE_FORMAT;

  readonly rows: GridRow[] = [];
}

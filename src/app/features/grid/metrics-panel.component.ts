import { Component } from '@angular/core';

import { DataService } from '../../core/data.service';
import { GridMetricsService } from '../../core/grid-metrics.service';

@Component({
  selector: 'app-metrics-panel',
  templateUrl: './metrics-panel.component.html',
  styleUrls: ['./metrics-panel.component.css'],
})
export class MetricsPanelComponent {
  constructor(
    readonly metrics: GridMetricsService,
    readonly data: DataService
  ) {}
}

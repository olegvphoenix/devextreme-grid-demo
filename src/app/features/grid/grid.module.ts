import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DxButtonModule } from 'devextreme-angular/ui/button';
import { DxCheckBoxModule } from 'devextreme-angular/ui/check-box';
import { DxDataGridModule } from 'devextreme-angular/ui/data-grid';
import { DxRadioGroupModule } from 'devextreme-angular/ui/radio-group';
import { DxSelectBoxModule } from 'devextreme-angular/ui/select-box';

import { FiltersModule } from '../../shared/filters/filters.module';
import { FilterChipsComponent } from './filter-chips.component';
import { GridRoutingModule } from './grid-routing.module';
import { GridComponent } from './grid.component';
import { LabelsCellComponent } from './labels-cell.component';
import { MetricsPanelComponent } from './metrics-panel.component';
import { StatusBadgeComponent } from './status-badge.component';

@NgModule({
  declarations: [
    GridComponent,
    MetricsPanelComponent,
    FilterChipsComponent,
    StatusBadgeComponent,
    LabelsCellComponent,
  ],
  imports: [
    CommonModule,
    DxButtonModule,
    DxCheckBoxModule,
    DxDataGridModule,
    DxRadioGroupModule,
    DxSelectBoxModule,
    FiltersModule,
    GridRoutingModule,
  ],
})
export class GridModule {}

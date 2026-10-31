import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DxButtonModule } from 'devextreme-angular/ui/button';
import { DxCheckBoxModule } from 'devextreme-angular/ui/check-box';
import { DxDataGridModule } from 'devextreme-angular/ui/data-grid';
import { DxRadioGroupModule } from 'devextreme-angular/ui/radio-group';
import { DxSelectBoxModule } from 'devextreme-angular/ui/select-box';

import { GridRoutingModule } from './grid-routing.module';
import { GridComponent } from './grid.component';
import { MetricsPanelComponent } from './metrics-panel.component';

@NgModule({
  declarations: [GridComponent, MetricsPanelComponent],
  imports: [
    CommonModule,
    DxButtonModule,
    DxCheckBoxModule,
    DxDataGridModule,
    DxRadioGroupModule,
    DxSelectBoxModule,
    GridRoutingModule,
  ],
})
export class GridModule {}

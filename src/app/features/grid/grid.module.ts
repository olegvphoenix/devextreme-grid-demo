import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DxDataGridModule } from 'devextreme-angular/ui/data-grid';

import { GridRoutingModule } from './grid-routing.module';
import { GridComponent } from './grid.component';

@NgModule({
  declarations: [GridComponent],
  imports: [CommonModule, DxDataGridModule, GridRoutingModule],
})
export class GridModule {}

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DxButtonModule } from 'devextreme-angular/ui/button';
import { DxCheckBoxModule } from 'devextreme-angular/ui/check-box';
import { DxDateBoxModule } from 'devextreme-angular/ui/date-box';
import { DxLoadIndicatorModule } from 'devextreme-angular/ui/load-indicator';
import { DxNumberBoxModule } from 'devextreme-angular/ui/number-box';
import { DxPopupModule } from 'devextreme-angular/ui/popup';
import { DxTextBoxModule } from 'devextreme-angular/ui/text-box';

import { ColumnFilterPopupComponent } from './column-filter-popup.component';
import { DateRangeFilterComponent } from './date-range-filter.component';
import { DependentMultiCheckboxFilterComponent } from './dependent-multi-checkbox-filter.component';
import { ExcelNumericFilterComponent } from './excel-numeric-filter.component';

@NgModule({
  declarations: [
    DateRangeFilterComponent,
    ExcelNumericFilterComponent,
    DependentMultiCheckboxFilterComponent,
    ColumnFilterPopupComponent,
  ],
  imports: [
    CommonModule,
    DxButtonModule,
    DxCheckBoxModule,
    DxDateBoxModule,
    DxLoadIndicatorModule,
    DxNumberBoxModule,
    DxPopupModule,
    DxTextBoxModule,
  ],
  exports: [
    DateRangeFilterComponent,
    ExcelNumericFilterComponent,
    DependentMultiCheckboxFilterComponent,
    ColumnFilterPopupComponent,
  ],
})
export class FiltersModule {}

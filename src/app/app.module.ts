import { LOCALE_ID, NgModule } from '@angular/core';
import {
  BrowserModule,
  BrowserTransferStateModule,
} from '@angular/platform-browser';
import { registerLocaleData } from '@angular/common';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import localeRu from '@angular/common/locales/ru';
import { loadMessages, locale } from 'devextreme/localization';
import ruMessages from 'devextreme/localization/messages/ru.json';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DemoHeadersInterceptor } from './core/demo-headers.interceptor';

registerLocaleData(localeRu);
loadMessages(ruMessages);
locale('ru');

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserTransferStateModule,
    HttpClientModule,
    AppRoutingModule,
  ],
  providers: [
    { provide: LOCALE_ID, useValue: 'ru-RU' },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: DemoHeadersInterceptor,
      multi: true,
    },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}

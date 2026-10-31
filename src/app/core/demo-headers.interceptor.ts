import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';

import { DemoFlagsService } from './demo-flags.service';

@Injectable()
export class DemoHeadersInterceptor implements HttpInterceptor {
  constructor(private readonly flags: DemoFlagsService) {}

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    if (!request.url.startsWith('/api/')) {
      return next.handle(request);
    }
    const setHeaders: Record<string, string> = {};
    if (this.flags.delayMs > 0) {
      setHeaders['X-Demo-Delay'] = String(this.flags.delayMs);
    }
    if (this.flags.fail) {
      setHeaders['X-Demo-Fail'] = '1';
    }
    return next.handle(request.clone({ setHeaders }));
  }
}

import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';

import { DemoFlagsService } from './demo-flags.service';
import { DemoHeadersInterceptor } from './demo-headers.interceptor';

describe('DemoHeadersInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let flags: DemoFlagsService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: HTTP_INTERCEPTORS,
          useClass: DemoHeadersInterceptor,
          multi: true,
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    flags = TestBed.inject(DemoFlagsService);
  });

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });

  it('без флагов заголовки не добавляются', () => {
    http.get('/api/health').subscribe();
    const req = backend.expectOne('/api/health');
    expect(req.request.headers.has('X-Demo-Delay')).toBeFalse();
    expect(req.request.headers.has('X-Demo-Fail')).toBeFalse();
  });

  it('добавляет X-Demo-Delay и X-Demo-Fail к запросам /api/', () => {
    flags.delayMs = 1500;
    flags.fail = true;
    http.post('/api/rows/query', '').subscribe();
    const req = backend.expectOne('/api/rows/query');
    expect(req.request.headers.get('X-Demo-Delay')).toBe('1500');
    expect(req.request.headers.get('X-Demo-Fail')).toBe('1');
  });

  it('не трогает запросы вне /api/', () => {
    flags.delayMs = 1500;
    flags.fail = true;
    http.get('/assets/loc.json').subscribe();
    const req = backend.expectOne('/assets/loc.json');
    expect(req.request.headers.has('X-Demo-Delay')).toBeFalse();
    expect(req.request.headers.has('X-Demo-Fail')).toBeFalse();
  });
});

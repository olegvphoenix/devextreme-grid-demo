# devextreme-grid-demo

Angular 12.2 + DevExtreme 23.2 (DataGrid) front end with a .NET 8 mock server in `server/MockServer`.

## Versions

- Angular 12.2.17, Angular CLI 12.2.18, TypeScript 4.3.5, RxJS 6.6.7, zone.js 0.11.8
- devextreme 23.2.15, devextreme-angular 23.2.15
- Node 24 works through `NODE_OPTIONS=--openssl-legacy-provider` (webpack 5.50 uses md4); every npm script sets it via `cross-env`.

## Commands

```
npm start        # ng serve on http://localhost:4200, /api is proxied to http://localhost:5080 (proxy.conf.json)
npm run build    # production build into dist/devextreme-grid-demo
npm test         # karma + jasmine, single run in ChromeHeadlessNoSandbox
npm run mock     # dotnet run --project server/MockServer
```

`karma.conf.js` sets `CHROME_BIN` to the installed Chrome (or Edge) when the variable is not set.

## Notes

- `BrowserTransferStateModule` must be imported in `AppModule`: every DevExtreme 23.2 component injects `TransferState`, which Angular 12 does not provide by default.
- DevExtreme 23.2 logs `W0019 - Unable to Locate a Valid License Key` to the console without a licence key; the UI is not affected.

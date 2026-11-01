# Демо DevExtreme DataGrid (Angular 12 + .NET 8) — спецификация

Дата: 2026-10-31. Источник требований: `docs/task2.md` (дословная копия задания). **Обязательны все пункты задания**;
раздел 13 связывает каждую его строку с местом реализации и проверкой.

## 1. Цель

Демо показывает по каждому требованию, закрывает ли его DevExtreme DataGrid «штатно» (конфигурация), «с доработкой»
(свой код) или «не реализуется». Если не реализуется — это фиксируется, а не скрывается. Оценка ставится по факту работы
в браузере и замерам, а не по ожиданиям. Результат: репозиторий, README, TESTCASES.md, страница «Итоги» с баллом,
работающая публикация на PL-Test.

Не-цели: авторизация, БД, вёрстка под телефоны, CI.

## 2. Решения

| Тема | Решение | Почему |
| --- | --- | --- |
| Клиент | Angular 12.2.x, TypeScript 4.3.x, RxJS 6.6 | Как в целевом проекте |
| DevExtreme | **23.2.15** + devextreme-angular 23.2.15: максимальная, подтверждена сборкой и браузером (24.1 требует Angular `>=16`). Точные версии без `^`/`~` | Задание |
| Node | Node 24 с `NODE_OPTIONS=--openssl-legacy-provider` через `cross-env` (webpack 5.50 использует md4) | Проверено разведчиком |
| Тема | Material, `dx.material.blue.light.css` | Задание |
| Локаль | `ru`, `LOCALE_ID = ru-RU`, `devextreme/localization/messages/ru.json`, даты `dd.MM.yyyy` | Задание |
| Сервер | ASP.NET Core minimal API, `net8.0`, порт 5080, `npm run mock` | Задание |
| Движок запросов | **DevExtreme.AspNet.Data 5.1.0** (MIT): `DataSourceLoader.Load` по `IQueryable` в памяти даёт пагинацию, сортировку, фильтр, группировку и агрегаты | Официальный серверный партнёр DataGrid, свой парсер не нужен. Только `Load`: `LoadAsync` на `EnumerableQuery` бросает `NotSupportedException`. Операторы `between` и `anyof` не поддерживаются — клиент их не отправляет |
| XPO | **Не используем** | Требует БД и пакет DevExpress.Xpo; `DataSourceLoader` работает с `IQueryable`, и XPO подключился бы позже через `XPQuery<T>` без изменений контракта. В задании «если необходимо» — здесь не необходимо. Отражено в «Итогах» |
| Данные | Детерминированный генератор в памяти (фиксированный seed), лениво на первый запрос размера; тот же генератор доступен отдельной командой `npm run generate -- <размер> <файл.csv>` | «Плюс локальный генератор данных» |
| XLSX | MiniExcel 1.46.0 (Apache-2.0), потоковая запись | Замер: 1 млн × 13 полей — 64 МБ пик, 19 с, файл 120 МБ |
| PDF | PDFsharp 6.2.4 (MIT), Core-сборка без GDI, свой `IFontResolver` с DejaVu Sans (ресурс в репозитории). Документ строится в памяти: ≈21 МБ на 1 000 страниц, 20 тыс. страниц — 525 МБ и 10 с | Лимитов строк нет; QuestPDF отклонён из-за условий лицензии |
| Штатный экспорт | exceljs 4.3.0, jspdf 2.5.1, file-saver; `skipLibCheck: true` (typings exceljs требуют `@types/node`) | Для сравнения с серверным |
| Тесты | TDD. Клиент: Karma + Jasmine, ChromeHeadless. Сервер: xUnit | Требование заказчика |
| Настройки | `localStorage`, префикс `dxgrid-demo:` | Задание |

Правило против выдуманного API: каждая опция и событие DevExtreme сверяются с `.d.ts` установленного пакета. Если свойства
нет — запись в «Ограничения» и обходной путь.

## 3. Структура

```
package.json, angular.json, proxy.conf.json, Dockerfile, .dockerignore
server/MockServer/        Program.cs, Data/, Api/, Export/, Assets/ (TTF)
server/MockServer.Tests/
src/app/
  core/                   DataService, GridMetricsService, StorageService, ApiError, http interceptor (X-Demo-*)
  models/                 production-record, load-options, column-filter, dataset, selection-mode, requirement
  shared/filters/         DateRangeFilterComponent, DependentMultiCheckboxFilterComponent, ExcelNumericFilterComponent,
                          ColumnFilterPopupComponent, filter-expression.ts, date-range.model.ts,
                          numeric-range.model.ts, dependent-list.model.ts
  features/grid/          lazy: страница грида, панель метрик, панель режимов, шаблоны ячеек, cell-selection.ts,
                          clipboard-format.ts, grid-state.ts
  features/settings/      lazy: просмотр localStorage
  features/about/         lazy: «О программе» и «Итоги», requirements.ts
scripts/count-loc.js      считает свои строки по требованиям -> src/assets/loc.json
docs/                     task2.md, superpowers/specs, superpowers/plans
README.md, TESTCASES.md
```

`AppRoutingModule`: `grid`, `settings`, `about` — каждый `loadChildren`. Пустой путь ведёт на `grid`.

## 4. Контракт API

Условия — формат DevExtreme. Запросы с условиями — `POST application/x-www-form-urlencoded` с теми же ключами, что читает
`DataSourceLoadOptionsParser` (`skip`, `take`, `requireTotalCount`, `requireGroupCount`, и JSON-строки `sort`, `group`,
`filter`, `totalSummary`, `groupSummary`), плюс `dataset`. Причина POST: список значений фильтра не помещается в URL.
Поля camelCase, даты `yyyy-MM-dd` (без времени и часового пояса; в клиенте `dateSerializationFormat: 'yyyy-MM-dd'`).

* `POST /api/rows/query` — ответ `DataSourceLoader`: `{ data, totalCount, groupCount, summary }`; `groupCount` обязателен для `groupPaging`.
* `POST /api/distinct` — `dataset`, `field`, `filter`, `search?`, `take?` (5000: все даты, ≈2 460, помещаются). Ответ
  `{ items: [{ value, text, count }], totalCount, truncated }`. `text` — **отображаемое значение**: русская подпись
  статуса, дата `dd.MM.yyyy`, число в формате ru. `search` ищет по `text` без учёта регистра.
* `POST /api/stats` — `dataset`, `field`, `filter`. Ответ `{ min, max, count }`.
* `GET /api/datasets` — `[{ size, generated, generationMs }]`.
* `PUT /api/rows/{id}/labels?dataset=n` — тело `{ "labels": ["срочно"] }`, ответ — запись. Оверлей в памяти.
* `POST /api/export/xlsx`, `POST /api/export/pdf` — форма: те же ключи + `columns` (JSON `[{ field, caption }]`).
  Выгружаются **все** строки под фильтром: только видимые колонки, в текущем порядке, порядок строк = поля группировки,
  затем сортировка, значения отображаемые. Лимита строк нет. XLSX пишется потоково; PDF строится в памяти и отдаётся целиком, `RequestAborted` проверяется между страницами.
  Одновременно идут не более 2 тяжёлых запросов, остальным `429` с текстом. Тяжёлые — оба экспорта и `/api/rows/query` без `take`.
* `POST /api/rows/query` без `take` допустим: так штатный `exportDataGrid` запрашивает все строки одним ответом (`loadAll`, `isLoadingAll`). Ответ сериализуется потоком, не буферизуется.
* `GET /api/health`.
* Заголовки демо: `X-Demo-Delay: <мс>` задерживает ответ; `X-Demo-Fail: 1` даёт `500` с `{ "message": "..." }`.
  Клиент выставляет их из переключателей страницы.

В проде сервер отдаёт собранный клиент из `wwwroot` (`UseDefaultFiles`, `UseStaticFiles`, `MapFallbackToFile("index.html")`).

## 5. Данные

`ProductionRecord`: `id`, `date`, `plant`, `line`, `product`, `batch`, `netWeight`, `grossWeight`, `qty`, `markingCode`,
`ean13`, `status`, `operator`, плюс `labels: string[]` — дополнение к списку задания, нужно для «Ярлыков»
(`labelsKey` = `|а|б|` — служебное поле для фильтра по ярлыку).

* `date` — от 01.02.2020 до сегодняшней даты.
* `line` определяется заводом, `product` — линией: справочник вложенный, значения не смешиваются.
* `netWeight`, `grossWeight` — `double`, округлены до 0,1 кг, `grossWeight > netWeight`. Значения в наборе сразу округлённые:
  выбранное в списке значение точно совпадает с записью при фильтре `=`.
* `qty` — целое > 0.
* `markingCode` — DataMatrix-строка вида `01<GTIN14>21<серийник>`.
* `ean13` — 13 цифр с верной контрольной суммой.
* `status`: `0 Новый`, `1 В работе`, `2 Агрегирован`, `3 Закрыт`.
* Один seed → одинаковые данные. Строки-справочники общие (без дублирования памяти на строку).

## 6. Страница грида

Клиент: `CustomStore` с `key: 'id'`, `load` идёт в `DataService.query`. `remoteOperations`: `paging`, `sorting`, `filtering`,
`grouping`, `summary`, `groupPaging` — все `true`.

**Переключатели страницы**: размер данных (1 000 / 100 000 / 1 000 000), режим ширины, режим выбора, «Задержка ответа»,
«Ошибка сервера», «Сбросить настройки».

**Пагинация**: `paging`, `pager` (`showPageSizeSelector`, `allowedPageSizes: [20, 50, 100, 500]`, `showInfo`). Высота грида
фиксирована, прокрутка внутри.

**Колонки**: `columnFixing.enabled`, `allowColumnReordering`, `allowColumnResizing`. Режим «По ширине страницы»:
колонки без ширины, `columnResizingMode: 'nextColumn'`, горизонтальной прокрутки нет. Режим «С прокруткой»: у колонок
ширина из `columnWidths`, `columnResizingMode: 'widget'`, появляется горизонтальная прокрутка. При переходе в режим «По ширине» ширины режима прокрутки
откладываются в `dxgrid-demo:scroll-widths` и возвращаются при обратном переключении: настройка пользователя не теряется. Скрытие/показ: `columnChooser` (`mode: 'select'`).

**Сортировка**: `sorting.mode: 'multiple'` на всех колонках данных; порядок статуса — по коду enum.

**Фильтры.** Штатный `headerFilter` не умеет показать диапазон в одном popup со списком, поэтому в заголовке через
`headerCellTemplate` своя иконка (клик не запускает сортировку и подсвечена при активном фильтре), она открывает
`ColumnFilterPopupComponent` (`dx-popup`):
* все колонки данных: `DependentMultiCheckboxFilterComponent` — список с поиском и «выбрать всё» с сервера;
* числовые (`id`, `netWeight`, `grossWeight`, `qty`): дополнительно `ExcelNumericFilterComponent` в том же popup;
* дата: дополнительно `DateRangeFilterComponent` в том же popup (`dx-date-box`, `displayFormat: 'dd.MM.yyyy'`);
* кнопки «Применить», «Очистить», «Отмена»;
* при `truncated` (`id`, `markingCode`, веса на больших наборах) — видимая подпись «Показаны первые N, уточните поиском»; поиск идёт на сервере; чекбокс «Выбрать всё» становится «Выбрать показанные (N)» и задаёт явные значения, а не отсутствие фильтра. Это ограничение попадает в «Итоги».

Состояние `GridFilterState` живёт на странице, в грид попадает через `filterValue`, собранный `buildFilterExpression`;
штатный `filterPanel` выключен: клик по нему открывает filterBuilder, который меняет `filterValue` мимо состояния и умеет операторы, отвергаемые сервером. Вместо него — своя строка чипов «Колонка: значение ×» над гридом. Список строится запросом `distinct` с фильтром «все остальные колонки + диапазон
своей колонки из черновика popup». Диапазон и список одной колонки объединяются через `and`. Открытый popup обновляет
список при смене диапазона; устаревший запрос отменяется.

**Сохранение**: `stateStoring` `type: 'custom'`, `savingTimeout: 0`, ключ `dxgrid-demo:state`: колонки, сортировка, группировка,
страница, размер страницы, выбранные ключи. `customSave` вырезает `filterValue`: единственный источник фильтров — `GridFilterState`, грид получает их при старте. Своё состояние: `dxgrid-demo:filters`, `dxgrid-demo:dataset`, `dxgrid-demo:width-mode`,
`dxgrid-demo:selection-mode`, `dxgrid-demo:demo-flags`, `dxgrid-demo:scroll-widths`. Дополнительно сброс при `ngOnDestroy` и `beforeunload`: уход сразу
после действия ничего не теряет. Восстановление идёт и при обновлении, и при возврате из другого раздела.

**Выбор**: режимы `none`, `single`, `multiple` + `showCheckBoxesMode: 'always'`, `multiple` + `showCheckBoxesMode: 'none'`,
`cells`. Режима выделения ячеек в DataGrid нет: свой код на `onCellClick`, `onCellPrepared` (класс CSS), `Ctrl` и `Shift`
(прямоугольник). Выбор ячеек сбрасывается при смене страницы, сортировки и фильтра — это отражено в «Ограничениях».

**Копирование**: кнопка и `Ctrl+C`. Формат: значения отображаемые, разделитель `\t`, строки `\r\n`, символы `\t`, `\r`, `\n`
и `"` в значении экранируются по правилам Excel, первая строка — заголовки видимых колонок. Клавиша `Ctrl+C` работает
только при выделении в гриде. Запись: `navigator.clipboard.writeText`, при его отсутствии (не HTTPS: PL-Test открывается
по HTTP) — запасной путь через скрытый `textarea` и `document.execCommand('copy')`.

**Шаблоны**: бейдж статуса (`cellTemplate`); колонка `type: 'buttons'` с действиями «Открыть», «В работу», «Закрыть» (данные не меняют,
показывают уведомление `notify` с id записи); ярлыки — чипы с удалением и добавлением
через поле ввода, сохранение `PUT /labels`, колонка фильтруется, не сортируется и не группируется.

**Загрузка и ошибки**: `loadPanel`; ошибка сервера показывается своей полоской с текстом и «Повторить», грид не ломается;
отмена устаревших — отписка от `HttpClient` (браузер прерывает XHR) при новом запросе того же типа, отменённый запрос
не показывается как ошибка, счётчик отменённых виден в панели метрик.

**Группировка**: `groupPanel.visible`, `grouping.autoExpandAll: false`, `summary.groupItems` (`count`, `sum` по весам и `qty`,
`avg` по весам), `summary.totalItems`. Группы и агрегаты считает сервер.

**Экспорт**: кнопки «Excel (сервер)», «PDF (сервер)» — все данные, все размеры. Для сравнения «Excel (штатно)», «PDF (штатно)»
через `exportDataGrid` (`devextreme/excel_exporter` + exceljs, `devextreme/pdf_exporter` + jspdf). При удалённых данных
штатный экспорт сам запрашивает все строки в браузер одним запросом без `skip`/`take`; его предел на 100 000 и 1 000 000 строк **замеряется**, а результат
пишется в «Итоги». Для кириллицы в jspdf шрифт DejaVu Sans грузится из `assets/fonts` и регистрируется через `addFileToVFS`/`addFont`. PDF на 1 млн строк (≈ 20 тыс. страниц) сервер делает без лимита; перед запуском — подтверждение с
оценкой объёма.

**Метрики** (панель над гридом, `GridMetricsService`, `performance.now()` и `requestAnimationFrame`): «Первая отрисовка, мс»;
«Сортировка, мс»; «Фильтрация, мс» (от действия до `onContentReady`); «FPS при прокрутке» текущий и минимальный; «Ответ сервера, мс»;
«Отменено запросов».

## 7. Логика под TDD (обязательные тесты)

`buildFilterExpression(state, excludeField?)`: пустое состояние → `null`; одно значение → `[f,'=',v]`; несколько → цепочка `or`;
диапазон → `>=`/`<=`; значения и диапазон одной колонки → `and`; несколько колонок → `and`; `excludeField` убирает свою колонку;
состояние не мутируется.

`DateRangeModel` (min/max и автоподстановка): `fromMax` = `to ?? max`, `toMin` = `from ?? min`; задан только «с» → «по» подставляется
как `max`; задан только «по» → «с» подставляется как `min`; вне границ → зажимается; «с» позже «по» → другое поле приравнивается к
изменённому; очистка поля очищает автоподставленную пару, но не введённую вручную; строки `yyyy-MM-dd` без сдвига часового пояса.
`NumericRangeModel` — те же правила для чисел.

`DependentListModel`: строит элементы из ответа; поиск по `text`; выбранные значения сохраняются при перезагрузке, если они есть
в новом списке, и отбрасываются, если их нет (только при полном, не усечённом ответе); «выбрано всё» нормализуется в
«нет фильтра» только при неусечённом списке, при усечённом это явный список значений; смена фильтра другой колонки требует перезагрузки, смена своего списка — нет; устаревший ответ игнорируется.

`clipboard-format`: TSV, заголовки, экранирование, `\r\n`. `cell-selection`: прямоугольник `Shift`, переключение `Ctrl`.
`grid-state`: чтение повреждённого JSON из `localStorage` даёт значения по умолчанию; `customSave` вырезает `filterValue`, ширины откладываются и возвращаются.

Сервер (xUnit, TDD): детерминизм и зависимости генератора, EAN13, границы дат, пагинация, сортировка, фильтр, группировка и агрегаты
через `/api/rows/query` (`WebApplicationFactory`), зависимый `distinct` с отображаемыми значениями, `stats`, ярлыки, экспорт
XLSX (читается обратно, все строки, порядок, колонки) и PDF (валидный файл, число страниц), `X-Demo-Fail`.

## 8. Лицензия

Факты пакета 23.2.15: ключ задаётся `config({ licenseKey })` до создания первого компонента; проверка один раз на приложение; без ключа — только `console.warn` W0019 (W0020 устаревший, W0021 неверный), баннера и водяного знака нет, работа не блокируется. CLI `devextreme-license` в этой версии нет. README описывает: где взять ключ в кабинете DevExpress, файл `src/devextreme-license.ts` вне git, вызов `config`. Коммерческое использование всё равно требует лицензии. Ключ в репозиторий не коммитится.

Ловушка версии: `BrowserTransferStateModule` обязателен в `AppModule`, иначе `NullInjectorError` в рантайме при зелёной сборке.

## 9. Итоги

`features/about/requirements.ts` — типизированный массив: требование, оценка, `locFiles`, API, ограничения и баги, ссылка на раздел.
Строки считает `scripts/count-loc.js` по `locFiles` (без пустых и комментариев), результат в `src/assets/loc.json`.
Колонка «Использованные API Kendo» в задании — остаток шаблона другого вендора: на странице она называется
«Использованные API DevExtreme», это отражено в README. Шкала: штатно = «да» = 2, с доработкой = «частично» = 1, не реализуется =
«нет» = 0. Внизу: сумма и максимум. Ссылки ведут на якоря страницы грида (`/grid#pagination` и т.п.).

## 10. Публикация

Один контейнер `devextreme-grid-demo` на внешнем хосте, многостадийный `Dockerfile` (Node для сборки клиента, SDK 8, рантайм
`aspnet:8.0`, процесс под пользователем `app`), порт `8095` наружу, `--memory=4g`, `--cpus=3`, `--restart unless-stopped`.
Адрес: `http://82.38.66.177:8095/`. Сборка на хосте из архива `git archive`. Проверка: `curl` локально и снаружи, браузер.
Авторизации нет: демо открыто в интернет на синтетических данных. От перегрузки — ограничитель тяжёлых запросов, предел
одновременных запросов списков значений, пределы тела запроса, числа условий фильтра и ярлыков.

## 11. Готовность

* `npm ci`, `npm run build`, `npm test` — без ошибок; `dotnet test server` — без ошибок.
* Запуск `npm run mock` + `npm start` и прогон `TESTCASES.md` в браузере на 1 000 и 1 000 000 строк.
* Замеры для 1 млн строк (ответ сервера, сортировка, фильтр, группировка, экспорт) записаны в README.
* Страница «Итоги» заполнена по факту.
* `http://82.38.66.177:8095/` открывается, грид работает.

## 12. Дополнения сверх задания

В README и «Итогах» отмечены как дополнения, на балл не влияют: поле `labels`, `PUT /labels`, `X-Demo-*`, `npm run generate`, Docker, публикация.

## 13. Трассировка задания

| Пункт задания | Раздел | Проверка |
| --- | --- | --- |
| §1 Angular 12, TS 4.3, макс. DevExtreme, точные версии | 2 | `package.json`, README |
| §1 Описание лицензии | 8 | README |
| §1 Material, ru-RU, `dd.MM.yyyy` | 2 | браузер, TC |
| §1 Мок .NET 8, пагинация, сортировка, фильтрация; XPO при необходимости; генератор | 2, 4, 5 | xUnit, `npm run generate` |
| §2 Все 13 полей, размеры 1k/100k/1M, зависимости | 5, 6 | xUnit, TC |
| §3 Три раздела | 3 | браузер |
| §3.1 Метрики | 6 | браузер |
| §3.1 Серверная пагинация | 4, 6 | xUnit, сеть в браузере |
| §3.1 Закрепление, перемещение, ширина | 6 | TC |
| §3.1 Вся ширина и горизонтальный скролл | 6 | TC |
| §3.1 Форма колонок | 6 | TC |
| §3.1 Сортировка | 6 | xUnit, TC |
| §3.1 Excel-like список, с сервера, зависимый | 4, 6, 7 | Jasmine, xUnit, TC |
| §3.1 Диапазон чисел в том же popup | 6, 7 | Jasmine, TC |
| §3.1 Диапазон дат в том же popup | 6, 7 | Jasmine, TC |
| §3.1 Отображаемые значения в фильтрах | 4 | xUnit, TC |
| §3.1 Автосохранение и восстановление | 6 | Jasmine, TC |
| §3.1 Пять режимов выбора, копирование | 6, 7 | Jasmine, TC |
| §3.1 Бейдж, кнопки, ярлыки | 6 | xUnit, TC |
| §3.1 Индикатор, ошибка, отмена | 6 | Jasmine, TC |
| §3.1 Серверная группировка с агрегатами | 4, 6 | xUnit, TC |
| §3.1 Экспорт всех данных в Excel и PDF | 4, 6 | xUnit, TC |
| §3.2 Содержимое LocalStorage | 3 | Jasmine, TC |
| §3.3 О программе, Итоги, балл | 9 | браузер |
| §4 Lazy-модули, `DataService`, три компонента фильтров | 3 | сборка |
| §4 Без `any`, модели в `models/` | 3 | поиск `: any` |
| §4 README с установкой, лицензией, версиями, запуском, ограничениями | 8, 11 | README |
| §4 Юнит-тесты фильтра дат и зависимого списка | 7 | `npm test` |
| §4 TESTCASES.md | 11 | файл |
| §4 Не придумывать API | 2 | сверка с `.d.ts` |
| §4 Компиляция, запуск, тесты | 11 | команды |
| Устно: публикация на PL-Test | 10 | браузер |

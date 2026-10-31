# Демо DevExtreme DataGrid — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Демо-приложение, которое по каждому требованию `docs/task2.md` честно показывает возможности DevExtreme DataGrid, с заполненной страницей «Итоги» и публикацией на PL-Test.

**Architecture:** Angular 12 SPA с тремя lazy-модулями ходит в ASP.NET Core minimal API. Сервер держит сгенерированные наборы в памяти и отдаёт их через `DataSourceLoader`. Грид работает в режиме `remoteOperations`; состояние фильтров принадлежит странице и передаётся в грид через `filterValue`.

**Tech Stack:** Angular 12.2.17, TypeScript 4.3.5, DevExtreme 23.2.15, Karma + Jasmine; .NET 8, DevExtreme.AspNet.Data 5.1.0, MiniExcel 1.46.0, PDFsharp 6.2.4, xUnit.

**Spec:** `docs/superpowers/specs/2026-10-31-devextreme-grid-demo-design.md`. Исполнитель читает её и `docs/task2.md`.

## Global Constraints

- **TDD обязателен:** сначала падающий тест, запуск и подтверждение падения, затем минимальный код, запуск, коммит. Для кода разметки, который нельзя проверить unit-тестом, приёмка — проверка в браузере, описанная в задаче.
- Все пункты `docs/task2.md` обязательны; пункт нельзя молча ослабить. Если не реализуется — запись в «Ограничения», обходной путь.
- Версии пакетов точные, без `^`/`~`, и в `package.json`, и в `.csproj`.
- `any` не используется там, где можно типизировать. Модели в `src/app/models/`.
- Каждая опция DevExtreme сверяется с `.d.ts` в `node_modules/devextreme`. Выдумывать API нельзя.
- Сервер: только `DataSourceLoader.Load`, не `LoadAsync`. Клиент не отправляет `between` и `anyof`.
- Весь текст интерфейса на русском; даты `dd.MM.yyyy`, в API `yyyy-MM-dd`, без `new Date('yyyy-MM-dd')` для отображения (сдвиг часового пояса).
- Команды: клиент `npm test`, `npm run build`; сервер `dotnet test server/MockServer.Tests`.
- Коммиты на английском, Conventional Commits, окончание `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Другие папки рядом с проектом не трогать. Запуск dev-серверов не оставлять висеть после задачи.

---

### Task 1: Сервер — генератор и наборы данных

**Files:**
- Create: `server/MockServer/MockServer.csproj`, `Program.cs`, `Data/ProductionRecord.cs`, `Data/Catalog.cs`, `Data/DataGenerator.cs`, `Data/DatasetStore.cs`
- Create: `server/MockServer.Tests/MockServer.Tests.csproj`, `DataGeneratorTests.cs`, `DatasetsApiTests.cs`
- Create: `server/MockServer.sln`

**Interfaces:**
- Produces:
  - `public sealed class ProductionRecord { int Id; DateTime Date; string Plant, Line, Product, Batch; double NetWeight, GrossWeight; int Qty; string MarkingCode, Ean13; int Status; string Operator; string[] Labels; string LabelsKey; }` — публичные свойства; `Date` — `DateTime` с `Kind=Unspecified`.
  - `public static class Catalog { string[] StatusNames; IReadOnlyDictionary<string, IReadOnlyDictionary<string, string[]>> PlantLines; string[] Operators; string[] LabelPresets; }`
  - `public static class DataGenerator { ProductionRecord[] Generate(int size, DateOnly today, int seed = 20200201); }`
  - `public sealed class DatasetStore { int[] Sizes = {1000,100000,1000000}; ProductionRecord[] Get(int size); DatasetInfo[] Describe(); ProductionRecord UpdateLabels(int size, int id, string[] labels); }` — singleton, потокобезопасная ленивая генерация; неизвестный размер — `ArgumentOutOfRangeException`.
  - `public partial class Program {}` — для `WebApplicationFactory`.
  - `GET /api/health`, `GET /api/datasets`.

- [ ] **Step 1: Создать solution и проекты.** `dotnet new sln`, `web` (net8.0) и `xunit` (net8.0), пакеты: `DevExtreme.AspNet.Data 5.1.0`, `MiniExcel 1.46.0`, `PDFsharp 6.2.4` в сервере; `Microsoft.AspNetCore.Mvc.Testing` 8.0.x (точная) в тестах. JSON: `DateTime` пишется как `yyyy-MM-dd` (свой `JsonConverter`, camelCase), порт 5080 в `launchSettings`/`Urls`.

- [ ] **Step 2: Написать падающие тесты генератора**

```csharp
public class DataGeneratorTests
{
    private static readonly DateOnly Today = new(2026, 10, 31);

    [Fact] public void SameSeedGivesSameData()
    {
        var a = DataGenerator.Generate(1000, Today);
        var b = DataGenerator.Generate(1000, Today);
        Assert.Equal(a.Select(r => r.MarkingCode), b.Select(r => r.MarkingCode));
    }

    [Fact] public void DatesAreBetweenFirstOfFebruary2020AndToday()
    {
        var rows = DataGenerator.Generate(10000, Today);
        Assert.All(rows, r => Assert.InRange(r.Date, new DateTime(2020, 2, 1), new DateTime(2026, 10, 31)));
        Assert.Equal(new DateTime(2020, 2, 1), rows.Min(r => r.Date));
    }

    [Fact] public void LineDependsOnPlantAndProductOnLine()
    {
        foreach (var r in DataGenerator.Generate(5000, Today))
        {
            Assert.True(Catalog.PlantLines[r.Plant].ContainsKey(r.Line));
            Assert.Contains(r.Product, Catalog.PlantLines[r.Plant][r.Line]);
        }
    }

    [Fact] public void WeightsAreRoundedAndGrossExceedsNet()
    {
        foreach (var r in DataGenerator.Generate(5000, Today))
        {
            Assert.Equal(Math.Round(r.NetWeight, 1), r.NetWeight);
            Assert.Equal(Math.Round(r.GrossWeight, 1), r.GrossWeight);
            Assert.True(r.GrossWeight > r.NetWeight);
            Assert.True(r.Qty > 0);
        }
    }

    [Fact] public void Ean13HasValidCheckDigit()
    {
        foreach (var r in DataGenerator.Generate(2000, Today))
        {
            Assert.Matches("^\\d{13}$", r.Ean13);
            var sum = r.Ean13.Take(12).Select((c, i) => (c - '0') * (i % 2 == 0 ? 1 : 3)).Sum();
            Assert.Equal((10 - sum % 10) % 10, r.Ean13[12] - '0');
        }
    }

    [Fact] public void MarkingCodeIsUniqueAndHasGs1Shape()
    {
        var rows = DataGenerator.Generate(5000, Today);
        Assert.Equal(rows.Length, rows.Select(r => r.MarkingCode).Distinct().Count());
        Assert.All(rows, r => Assert.Matches("^01\\d{14}21[A-Za-z0-9]+$", r.MarkingCode));
    }

    [Fact] public void StatusUsesAllFourValues() =>
        Assert.Equal(new[] { 0, 1, 2, 3 },
            DataGenerator.Generate(2000, Today).Select(r => r.Status).Distinct().OrderBy(s => s));
}
```

`DatasetsApiTests` через `WebApplicationFactory<Program>`: `GET /api/health` = 200; `GET /api/datasets` возвращает три размера; `DatasetStore.Get(1000)` дважды отдаёт один массив; `Get(5)` бросает.

- [ ] **Step 3: Запустить** `dotnet test server/MockServer.Tests` — ожидается ошибка компиляции.
- [ ] **Step 4: Реализовать.** Справочники: 4 завода, по 2–4 линии, по 3–5 продуктов, строки общие. `Random(seed)`. Первая запись получает `2020-02-01`, последняя — `today`, чтобы границы были точными. Партия `P-yyMM-NNNN`. Генератор на 1 млн — не дольше ≈5 с.
- [ ] **Step 5: `npm run generate`.** Если `args[0] == "generate"`, `Program` пишет CSV (`size`, `path`) и завершается. Тест: вызов метода `CsvWriter.Write(rows, TextWriter)` даёт заголовок и `size` строк. В `package.json`: `"generate": "dotnet run --project server/MockServer -- generate"`.
- [ ] **Step 6: Запустить тесты** — PASS.
- [ ] **Step 7: Коммит** `feat(server): add data generator and datasets api`.

### Task 2: Сервер — запрос строк, ярлыки, демо-заголовки

**Files:**
- Create: `server/MockServer/Api/LoadOptionsReader.cs`, `Api/RowsEndpoints.cs`, `Api/DemoHeadersMiddleware.cs`, `Api/HeavyRequestLimiter.cs`
- Modify: `Program.cs`
- Test: `server/MockServer.Tests/RowsApiTests.cs`, `LabelsApiTests.cs`, `DemoHeadersTests.cs`

**Interfaces:**
- Consumes: `DatasetStore` из Task 1.
- Produces:
  - `LoadOptionsReader.Read(IFormCollection form) -> (int dataset, DataSourceLoadOptionsBase options)` через `DataSourceLoadOptionsParser.Parse(options, key => form[key])`. Отсутствующий или неизвестный `dataset` — `400` с `{ message }`.
  - `POST /api/rows/query`, `PUT /api/rows/{id}/labels?dataset=n`.
  - `HeavyRequestLimiter.TryEnter(out IDisposable lease)` — не более 2 одновременно.
  - `options.StringToLower = true`, чтобы `contains` был без учёта регистра, если свойство есть в 5.1.0; если нет — зафиксировать.

- [ ] **Step 1: Написать падающие тесты.** Помощник `PostForm(client, url, params (string,string)[])`. Обязательные случаи для набора 1000:

```csharp
[Fact] public async Task PagingReturnsOnlyRequestedPage()
{
    var json = await Query(("dataset","1000"),("skip","20"),("take","10"),("requireTotalCount","true"));
    Assert.Equal(10, json.GetProperty("data").GetArrayLength());
    Assert.Equal(1000, json.GetProperty("totalCount").GetInt32());
}

[Fact] public async Task SortingByDateDescending()
{
    var json = await Query(("dataset","1000"),("take","5"),("sort","[{\"selector\":\"date\",\"desc\":true}]"));
    var dates = json.GetProperty("data").EnumerateArray().Select(r => r.GetProperty("date").GetString()).ToList();
    Assert.Equal(dates.OrderByDescending(d => d, StringComparer.Ordinal), dates);
}

[Fact] public async Task FilterOrChainAndDateRange()
{
    var filter = "[[[\"status\",\"=\",1],\"or\",[\"status\",\"=\",2]],\"and\",[[\"date\",\">=\",\"2021-01-01\"],\"and\",[\"date\",\"<=\",\"2021-12-31\"]]]";
    var json = await Query(("dataset","1000"),("take","1000"),("filter",filter),("requireTotalCount","true"));
    Assert.All(json.GetProperty("data").EnumerateArray(), r =>
    {
        Assert.Contains(r.GetProperty("status").GetInt32(), new[] { 1, 2 });
        Assert.StartsWith("2021-", r.GetProperty("date").GetString());
    });
}

[Fact] public async Task GroupingReturnsGroupsWithServerSummaries()
{
    var json = await Query(("dataset","1000"),("skip","0"),("take","2"),
        ("group","[{\"selector\":\"plant\",\"isExpanded\":false}]"),
        ("groupSummary","[{\"selector\":\"qty\",\"summaryType\":\"sum\"},{\"selector\":\"netWeight\",\"summaryType\":\"avg\"}]"),
        ("totalSummary","[{\"selector\":\"qty\",\"summaryType\":\"sum\"}]"),
        ("requireGroupCount","true"),("requireTotalCount","true"));
    Assert.Equal(4, json.GetProperty("groupCount").GetInt32());
    Assert.Equal(2, json.GetProperty("data").GetArrayLength());
    Assert.Equal(2, json.GetProperty("data")[0].GetProperty("summary").GetArrayLength());
    Assert.Equal(1000, json.GetProperty("totalCount").GetInt32());
}

[Fact] public async Task WithoutTakeAllRowsAreReturned()
{
    var json = await Query(("dataset","1000"));
    Assert.Equal(1000, json.GetProperty("data").GetArrayLength());
}
```

Также: неизвестный набор — 400; `PUT labels` возвращает запись, повторный query её отражает, `labelsKey` = `|а|б|`; фильтр `["labelsKey","contains","|а|"]` находит запись; `X-Demo-Fail: 1` — 500 с `message`; `X-Demo-Delay: 200` — ответ не быстрее 200 мс; лимитер отдаёт `false` на третий вход.

- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать.** Запрос без `take` — под `HeavyRequestLimiter`, иначе 429. Ответ с большим `data` сериализуется в поток `Response.Body` (`JsonSerializer.SerializeAsync`). Демо-заголовки действуют только на `/api/*` кроме `/api/health`.
- [ ] **Step 4: Запустить** — PASS.
- [ ] **Step 5: Замер.** На наборе 1 000 000: сортировка, фильтр, группировка, ответ на страницу. Цифры записать в `docs/measurements.md`.
- [ ] **Step 6: Коммит** `feat(server): add rows query, labels and demo headers`.

### Task 3: Сервер — distinct и stats

**Files:**
- Create: `server/MockServer/Api/ValueFormatter.cs`, `Api/ColumnEndpoints.cs`
- Test: `server/MockServer.Tests/DistinctApiTests.cs`, `StatsApiTests.cs`, `ValueFormatterTests.cs`

**Interfaces:**
- Produces:
  - `ValueFormatter.Text(string field, object? value) -> string`: `status` → русская подпись; `date` → `dd.MM.yyyy`; `netWeight`/`grossWeight` → `1 234,5` (`ru-RU`); `qty`/`id` → `1 234`; строка как есть.
  - `POST /api/distinct` → `{ items:[{value,text,count}], totalCount, truncated }`; значения отсортированы по `value`.
  - `POST /api/stats` → `{ min, max, count }`; для даты строки `yyyy-MM-dd`.
  - `field` проверяется по белому списку колонок, иначе 400. `labels` раскрывается: каждое значение ярлыка отдельным элементом.

- [ ] **Step 1: Написать падающие тесты**

```csharp
[Fact] public async Task StatusListShowsRussianNames()
{
    var r = await Distinct(("dataset","1000"),("field","status"));
    Assert.Equal(new[] { "Новый", "В работе", "Агрегирован", "Закрыт" },
        r.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("text").GetString()));
}

[Fact] public async Task ListDependsOnFiltersOfOtherColumns()
{
    var all = await Distinct(("dataset","1000"),("field","line"));
    var plant = all.GetProperty("items")[0].GetProperty("value").GetString();
    var plantName = Catalog.PlantLines.Keys.First();
    var narrowed = await Distinct(("dataset","1000"),("field","line"),("filter",$"[\"plant\",\"=\",\"{plantName}\"]"));
    Assert.Equal(
        Catalog.PlantLines[plantName].Keys.OrderBy(k => k, StringComparer.Ordinal),
        narrowed.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("value").GetString()).OrderBy(k => k, StringComparer.Ordinal));
    Assert.True(narrowed.GetProperty("totalCount").GetInt32() < all.GetProperty("totalCount").GetInt32());
}

[Fact] public async Task DatesAreFormattedForDisplay()
{
    var r = await Distinct(("dataset","1000"),("field","date"));
    Assert.Matches("^\\d{2}\\.\\d{2}\\.\\d{4}$", r.GetProperty("items")[0].GetProperty("text").GetString());
    Assert.Matches("^\\d{4}-\\d{2}-\\d{2}$", r.GetProperty("items")[0].GetProperty("value").GetString());
}

[Fact] public async Task TruncationIsReported()
{
    var r = await Distinct(("dataset","1000"),("field","id"),("take","10"));
    Assert.Equal(10, r.GetProperty("items").GetArrayLength());
    Assert.True(r.GetProperty("truncated").GetBoolean());
    Assert.Equal(1000, r.GetProperty("totalCount").GetInt32());
}

[Fact] public async Task SearchWorksOnDisplayText()
{
    var r = await Distinct(("dataset","1000"),("field","status"),("search","рабо"));
    Assert.Equal("В работе", r.GetProperty("items")[0].GetProperty("text").GetString());
    Assert.Equal(1, r.GetProperty("items").GetArrayLength());
}

[Fact] public async Task CountsSumToFilteredTotal()
{
    var r = await Distinct(("dataset","1000"),("field","status"));
    Assert.Equal(1000, r.GetProperty("items").EnumerateArray().Sum(i => i.GetProperty("count").GetInt32()));
}
```

`StatsApiTests`: `qty` и `date` дают `min <= max`; `count` учитывает фильтр; для строкового поля — 400. `ValueFormatterTests`: `1234.5` → `1 234,5` (сравнение с учётом неразрывного пробела из `ru-RU`).

- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать.** Фильтр применяется через `DataSourceLoader.Load` (`options.Filter`, без `skip/take`), затем `GroupBy` в памяти. Значение метки `labels`: разворот через `SelectMany`. На 1 млн `distinct` по `markingCode` — проверить время, записать в `docs/measurements.md`.
- [ ] **Step 4: Запустить** — PASS.
- [ ] **Step 5: Коммит** `feat(server): add distinct and stats endpoints`.

### Task 4: Сервер — экспорт XLSX и PDF

**Files:**
- Create: `server/MockServer/Export/ExportRequest.cs`, `XlsxExporter.cs`, `PdfExporter.cs`, `DejaVuFontResolver.cs`, `Api/ExportEndpoints.cs`
- Create: `server/MockServer/Assets/DejaVuSans.ttf` (и лицензия шрифта `Assets/DejaVu-LICENSE.txt`), встроенный ресурс
- Test: `server/MockServer.Tests/ExportApiTests.cs`

**Interfaces:**
- Consumes: `LoadOptionsReader`, `ValueFormatter`, `HeavyRequestLimiter`.
- Produces: `POST /api/export/xlsx`, `POST /api/export/pdf`; поле формы `columns` = JSON `[{field,caption}]`; пустой список или неизвестная колонка — 400; занят лимитер — 429.

- [ ] **Step 1: Написать падающие тесты**

```csharp
private const string Columns = "[{\"field\":\"date\",\"caption\":\"Дата\"},{\"field\":\"status\",\"caption\":\"Статус\"}]";

[Fact] public async Task XlsxContainsAllRowsOfFilterNotJustAPage()
{
    var bytes = await Export("xlsx",("dataset","1000"),("columns",Columns),("filter","[\"status\",\"=\",1]"),("take","10"));
    using var stream = new MemoryStream(bytes);
    var rows = stream.Query(useHeaderRow: true).Cast<IDictionary<string, object>>().ToList();
    Assert.True(rows.Count > 10);
    Assert.All(rows, r => Assert.Equal("В работе", r["Статус"]));
}

[Fact] public async Task XlsxUsesColumnsAndOrderOfCurrentView()
{
    var bytes = await Export("xlsx",("dataset","1000"),("columns",Columns),("sort","[{\"selector\":\"date\",\"desc\":true}]"));
    using var stream = new MemoryStream(bytes);
    var rows = stream.Query(useHeaderRow: true).Cast<IDictionary<string, object>>().ToList();
    Assert.Equal(new[] { "Дата", "Статус" }, rows[0].Keys);
    var dates = rows.Select(r => DateTime.ParseExact((string)r["Дата"], "dd.MM.yyyy", null)).ToList();
    Assert.Equal(dates.OrderByDescending(d => d), dates);
}

[Fact] public async Task GroupFieldsDefineRowOrder()
{
    var bytes = await Export("xlsx",("dataset","1000"),
        ("columns","[{\"field\":\"plant\",\"caption\":\"Завод\"}]"),
        ("group","[{\"selector\":\"plant\",\"desc\":false}]"));
    using var stream = new MemoryStream(bytes);
    var plants = stream.Query(useHeaderRow: true).Cast<IDictionary<string, object>>().Select(r => (string)r["Завод"]).ToList();
    Assert.Equal(plants.OrderBy(p => p, StringComparer.Ordinal), plants);
}

[Fact] public async Task PdfIsValidAndHasManyPagesWithCyrillic()
{
    var bytes = await Export("pdf",("dataset","1000"),("columns",Columns));
    Assert.StartsWith("%PDF", System.Text.Encoding.ASCII.GetString(bytes, 0, 4));
    using var doc = PdfReader.Open(new MemoryStream(bytes), PdfDocumentOpenMode.Import);
    Assert.True(doc.PageCount >= 1000 / 50);
}
```

Также: `columns` пуст — 400; при занятом лимитере — 429.

- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать.** Шрифт: `npm pack dejavu-fonts-ttf` во временной папке, взять `DejaVuSans.ttf` и лицензию. `GlobalFontSettings.FontResolver` задаётся один раз. XLSX: `IEnumerable<IDictionary<string, object>>` лениво, `MiniExcel.SaveAsAsync(Response.Body, ...)` с `Content-Disposition`. PDF: альбомный A4, заголовок на каждой странице, 45 строк на страницу, ширина колонок пропорционально, текст обрезается многоточием, номера страниц, `CompressContentStreams = true`, `RequestAborted` между страницами. Порядок строк = `group`, затем `sort`, поля группы первыми (`options.Sort` = группа + сортировка, `options.Group = null`).
- [ ] **Step 4: Запустить** — PASS.
- [ ] **Step 5: Замер** XLSX и PDF на 1 млн: время, память, размер. В `docs/measurements.md`.
- [ ] **Step 6: Коммит** `feat(server): add full-data xlsx and pdf export`.

### Task 5: Клиент — модели, DataService, хранилище

**Files:**
- Create: `src/app/models/production-record.model.ts`, `load-options.model.ts`, `column-filter.model.ts`, `dataset.model.ts`, `selection-mode.model.ts`, `distinct.model.ts`
- Create: `src/app/core/data.service.ts`, `data.service.spec.ts`, `storage.service.ts`, `storage.service.spec.ts`, `api-error.ts`, `demo-headers.interceptor.ts`, `demo-flags.service.ts`
- Modify: `src/app/app.module.ts` (`HttpClientModule`, interceptor), `tsconfig.json` (`skipLibCheck: true`)

**Interfaces:**
- Produces:

```ts
// models/column-filter.model.ts
export type FilterValue = string | number;
export interface ColumnFilterState { values?: FilterValue[]; from?: FilterValue | null; to?: FilterValue | null; }
export type GridFilterState = Record<string, ColumnFilterState>;
export type FilterCondition = [string, string, FilterValue];
export type FilterExpression = FilterCondition | Array<FilterExpression | 'and' | 'or'>;

// models/dataset.model.ts
export type DatasetSize = 1000 | 100000 | 1000000;
export const DATASET_SIZES: DatasetSize[] = [1000, 100000, 1000000];

// models/selection-mode.model.ts
export type SelectionMode = 'none' | 'row' | 'multi-checkbox' | 'multi-plain' | 'cells';

// models/distinct.model.ts
export interface DistinctItem { value: FilterValue; text: string; count: number; }
export interface DistinctResult { items: DistinctItem[]; totalCount: number; truncated: boolean; }
export interface ColumnStats { min: FilterValue | null; max: FilterValue | null; count: number; }

// core/data.service.ts
export class DataService {
  dataset: DatasetSize;
  readonly responseMs$: Observable<number>;
  readonly cancelled$: Observable<number>;           // накопительный счётчик отменённых запросов
  query(options: GridLoadOptions): Observable<GridLoadResult>;      // новый query отменяет предыдущий той же группы
  distinct(field: string, filter: FilterExpression | null, search?: string): Observable<DistinctResult>;
  stats(field: string, filter: FilterExpression | null): Observable<ColumnStats>;
  updateLabels(id: number, labels: string[]): Observable<ProductionRecord>;
  exportFile(kind: 'xlsx' | 'pdf', request: ExportRequest): Observable<Blob>;
}

// core/api-error.ts
export class ApiError extends Error { constructor(public status: number, message: string); }

// core/storage.service.ts
export class StorageService {
  static readonly PREFIX = 'dxgrid-demo:';
  read<T>(key: string, fallback: T): T;      // повреждённый JSON -> fallback
  write<T>(key: string, value: T): void;
  remove(key: string): void;
  entries(): Array<{ key: string; value: string }>;   // только ключи приложения
  clear(): void;                                      // только ключи приложения
}
```

- [ ] **Step 1: Написать падающие тесты.** `HttpTestingController`:

```ts
it('новый query отменяет предыдущий', () => {
  service.query({ take: 20 }).subscribe();
  const first = http.expectOne('/api/rows/query');
  service.query({ take: 20, skip: 20 }).subscribe();
  expect(first.cancelled).toBeTrue();
  http.expectOne('/api/rows/query');
});

it('отмена увеличивает счётчик', () => {
  let count = 0;
  service.cancelled$.subscribe(c => (count = c));
  service.query({}).subscribe();
  service.query({}).subscribe();
  expect(count).toBe(1);
});

it('отправляет form-urlencoded c JSON-строками и dataset', () => {
  service.dataset = 100000;
  service.query({ skip: 0, take: 20, sort: [{ selector: 'date', desc: true }] }).subscribe();
  const req = http.expectOne('/api/rows/query');
  expect(req.request.headers.get('Content-Type')).toContain('application/x-www-form-urlencoded');
  const body = new URLSearchParams(req.request.body);
  expect(body.get('dataset')).toBe('100000');
  expect(JSON.parse(body.get('sort')!)).toEqual([{ selector: 'date', desc: true }]);
});

it('ошибка сервера превращается в ApiError с сообщением', () => {
  let error: ApiError | undefined;
  service.query({}).subscribe({ error: e => (error = e) });
  http.expectOne('/api/rows/query').flush({ message: 'Сбой' }, { status: 500, statusText: 'Error' });
  expect(error instanceof ApiError).toBeTrue();
  expect(error!.message).toBe('Сбой');
});

it('запрос одной колонки distinct отменяет только свой предыдущий', () => {
  service.distinct('plant', null).subscribe();
  const a = http.expectOne('/api/distinct');
  service.stats('qty', null).subscribe();
  expect(a.cancelled).toBeFalse();
  service.distinct('plant', null).subscribe();
  expect(a.cancelled).toBeTrue();
});
```

`StorageService`: повреждённый JSON даёт fallback; `entries()` не возвращает чужие ключи; `clear()` не трогает чужие ключи.

- [ ] **Step 2: Запустить** `npm test` — FAIL.
- [ ] **Step 3: Реализовать.** Отмена — `Subscription` на группу запросов (`rows`, `distinct`, `stats`). Экспорт не отменяет остальные. Interceptor добавляет `X-Demo-Delay`/`X-Demo-Fail` из `DemoFlagsService` к запросам `/api/`. `DataService` не знает о гриде.
- [ ] **Step 4: Запустить** — PASS.
- [ ] **Step 5: Коммит** `feat(client): add models, data service and storage`.

### Task 6: Клиент — логика фильтров

**Files:**
- Create: `src/app/shared/filters/filter-expression.ts` + `.spec.ts`, `date-range.model.ts` + `.spec.ts`, `numeric-range.model.ts` + `.spec.ts`, `dependent-list.model.ts` + `.spec.ts`

**Interfaces:**
- Produces:

```ts
export function buildFilterExpression(state: GridFilterState, excludeField?: string): FilterExpression | null;
export function buildColumnExpression(field: string, s: ColumnFilterState): FilterExpression | null;
export function isColumnFilterActive(s: ColumnFilterState | undefined): boolean;

export class DateRangeModel {
  constructor(public readonly min: string, public readonly max: string);
  from: string | null; to: string | null;
  readonly fromMax: string; readonly toMin: string;
  setFrom(v: string | null): void; setTo(v: string | null): void;
  toState(): Pick<ColumnFilterState, 'from' | 'to'>;
  static fromState(min: string, max: string, s?: ColumnFilterState): DateRangeModel;
}
export class NumericRangeModel { /* те же имена, значения number */ }

export class DependentListModel {
  readonly items: DistinctItem[]; truncated: boolean; totalCount: number;
  constructor(selected?: FilterValue[]);
  applyResponse(requestId: number, result: DistinctResult): void;   // устаревший requestId игнорируется
  nextRequestId(): number;
  toggle(value: FilterValue): void; isSelected(value: FilterValue): boolean;
  selectAll(): void; clear(): void;
  readonly allSelected: boolean; readonly selectAllLabel: string;
  toValues(): FilterValue[] | undefined;
}
export function needsReload(prev: GridFilterState, next: GridFilterState, field: string): boolean;
```

- [ ] **Step 1: Написать падающие тесты** (`buildFilterExpression`)

```ts
it('пустое состояние -> null', () => expect(buildFilterExpression({})).toBeNull());
it('одно значение', () => expect(buildFilterExpression({ a: { values: [1] } })).toEqual(['a', '=', 1]));
it('несколько значений -> or', () =>
  expect(buildFilterExpression({ a: { values: [1, 2] } })).toEqual([['a', '=', 1], 'or', ['a', '=', 2]]));
it('диапазон -> >= и <=, без between', () =>
  expect(buildFilterExpression({ a: { from: 1, to: 2 } })).toEqual([['a', '>=', 1], 'and', ['a', '<=', 2]]));
it('значения и диапазон одной колонки -> and', () =>
  expect(buildFilterExpression({ a: { values: [1, 2], from: 0, to: 5 } })).toEqual(
    [[['a', '=', 1], 'or', ['a', '=', 2]], 'and', [['a', '>=', 0], 'and', ['a', '<=', 5]]]));
it('несколько колонок -> and', () =>
  expect(buildFilterExpression({ a: { values: [1] }, b: { values: [2] } })).toEqual([['a', '=', 1], 'and', ['b', '=', 2]]));
it('excludeField убирает колонку', () =>
  expect(buildFilterExpression({ a: { values: [1] }, b: { values: [2] } }, 'a')).toEqual(['b', '=', 2]));
it('не мутирует вход', () => {
  const s = { a: { values: [1, 2] } };
  buildFilterExpression(s);
  expect(s).toEqual({ a: { values: [1, 2] } });
});
it('ярлыки ищутся contains по labelsKey', () =>
  expect(buildColumnExpression('labels', { values: ['а'] })).toEqual(['labelsKey', 'contains', '|а|']));
```

`DateRangeModel`:

```ts
const make = () => new DateRangeModel('2020-02-01', '2026-10-31');
it('только с -> по = max', () => { const m = make(); m.setFrom('2021-01-01'); expect(m.to).toBe('2026-10-31'); });
it('только по -> с = min', () => { const m = make(); m.setTo('2021-01-01'); expect(m.from).toBe('2020-02-01'); });
it('fromMax = to, toMin = from', () => {
  const m = make(); m.setFrom('2021-01-01'); m.setTo('2022-01-01');
  expect(m.fromMax).toBe('2022-01-01'); expect(m.toMin).toBe('2021-01-01');
});
it('без значений границы = min/max', () => { const m = make(); expect(m.fromMax).toBe('2026-10-31'); expect(m.toMin).toBe('2020-02-01'); });
it('зажимает вне диапазона', () => { const m = make(); m.setFrom('2019-01-01'); expect(m.from).toBe('2020-02-01'); });
it('с позже по -> по приравнивается', () => {
  const m = make(); m.setFrom('2021-01-01'); m.setTo('2021-06-01'); m.setFrom('2022-01-01'); expect(m.to).toBe('2022-01-01');
});
it('по раньше с -> с приравнивается', () => {
  const m = make(); m.setFrom('2021-06-01'); m.setTo('2021-07-01'); m.setTo('2021-01-01'); expect(m.from).toBe('2021-01-01');
});
it('очистка убирает автоподставленное', () => { const m = make(); m.setFrom('2021-01-01'); m.setFrom(null); expect(m.to).toBeNull(); });
it('очистка не убирает введённое вручную', () => {
  const m = make(); m.setFrom('2021-01-01'); m.setTo('2022-01-01'); m.setFrom(null); expect(m.to).toBe('2022-01-01');
});
it('полный охват -> нет фильтра', () => {
  const m = make(); m.setFrom('2020-02-01'); m.setTo('2026-10-31'); expect(m.toState()).toEqual({});
});
it('строки сравниваются без Date', () => {
  const m = make(); m.setFrom('2021-01-01'); expect(m.toState().from).toBe('2021-01-01');
});
```

`NumericRangeModel` — те же случаи на числах. `DependentListModel`:

```ts
const response = (values: FilterValue[], truncated = false): DistinctResult => ({
  items: values.map(v => ({ value: v, text: String(v), count: 1 })), totalCount: values.length, truncated,
});
it('устаревший ответ игнорируется', () => {
  const m = new DependentListModel();
  const old = m.nextRequestId(); const fresh = m.nextRequestId();
  m.applyResponse(fresh, response([1])); m.applyResponse(old, response([2]));
  expect(m.items.map(i => i.value)).toEqual([1]);
});
it('выбор сохраняется, если значение осталось', () => {
  const m = new DependentListModel([1, 2]);
  m.applyResponse(m.nextRequestId(), response([1, 3]));
  expect(m.isSelected(1)).toBeTrue();
});
it('значение, исчезнувшее из полного списка, отбрасывается', () => {
  const m = new DependentListModel([1, 2]);
  m.applyResponse(m.nextRequestId(), response([1, 3]));
  expect(m.toValues()).toEqual([1]);
});
it('при усечённом списке скрытые значения сохраняются', () => {
  const m = new DependentListModel([1, 2]);
  m.applyResponse(m.nextRequestId(), response([1], true));
  expect(m.toValues()).toEqual([1, 2]);
});
it('выбрано всё -> нет фильтра при полном списке', () => {
  const m = new DependentListModel(); m.applyResponse(m.nextRequestId(), response([1, 2]));
  m.selectAll(); expect(m.toValues()).toBeUndefined();
});
it('выбрано всё при усечении -> явный список и другая подпись', () => {
  const m = new DependentListModel(); m.applyResponse(m.nextRequestId(), response([1, 2], true));
  m.selectAll();
  expect(m.toValues()).toEqual([1, 2]);
  expect(m.selectAllLabel).toBe('Выбрать показанные (2)');
});
it('needsReload: чужая колонка да, своя нет', () => {
  expect(needsReload({}, { b: { values: [1] } }, 'a')).toBeTrue();
  expect(needsReload({}, { a: { values: [1] } }, 'a')).toBeFalse();
});
```

- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать** без импортов DevExtreme. `isManual`-флаг поля отличает введённое от автоподставленного.
- [ ] **Step 4: Запустить** — PASS.
- [ ] **Step 5: Коммит** `feat(client): add filter expression and range logic`.

### Task 7: Клиент — компоненты фильтров

**Files:**
- Create: `src/app/shared/filters/filters.module.ts`, `date-range-filter.component.ts`/`.html`/`.spec.ts`, `excel-numeric-filter.component.ts`/`.html`/`.spec.ts`, `dependent-multi-checkbox-filter.component.ts`/`.html`/`.spec.ts`, `column-filter-popup.component.ts`/`.html`/`.css`/`.spec.ts`

**Interfaces:**
- Consumes: `DataService.distinct/stats`, модели из Task 6.
- Produces:

```ts
export class DependentMultiCheckboxFilterComponent {
  @Input() field: string; @Input() filter: FilterExpression | null; @Input() selected?: FilterValue[];
  @Output() selectedChange: EventEmitter<FilterValue[] | undefined>;
}
export class DateRangeFilterComponent {
  @Input() min: string; @Input() max: string; @Input() state?: ColumnFilterState;
  @Output() rangeChange: EventEmitter<Pick<ColumnFilterState, 'from' | 'to'>>;
}
export class ExcelNumericFilterComponent { /* те же Input/Output, числа; @Input() format?: string */ }

export type ColumnKind = 'string' | 'number' | 'date' | 'enum' | 'labels';
export class ColumnFilterPopupComponent {
  @Input() column: { field: string; caption: string; kind: ColumnKind } | null;
  @Input() target: HTMLElement | null;
  @Input() state: GridFilterState;
  @Input() visible: boolean;
  @Output() visibleChange: EventEmitter<boolean>;
  @Output() apply: EventEmitter<{ field: string; value: ColumnFilterState | null }>;
}
```

Компоненты самостоятельные: никакой зависимости от грида, только `field`, `filter` и `DataService`. `filter` включает другие колонки и диапазон своей колонки из черновика.

- [ ] **Step 1: Падающие тесты** через `TestBed` с заглушкой `DataService`:

```ts
it('запрашивает список при открытии с переданным фильтром', ...);
it('повторный запрос при смене filter', ...);
it('поиск вызывает distinct со строкой search с задержкой 300 мс', fakeAsync(...));
it('показывает text, а не value', ...);
it('подпись об усечении видна при truncated', ...);
it('DateRangeFilterComponent выдаёт автоподставленное значение', ...);
it('popup показывает диапазон только для number и date', ...);
it('Применить выдаёт values вместе с from/to', ...);
it('Очистить выдаёт null', ...);
it('Смена диапазона в черновике обновляет фильтр списка', ...);
```

Каждый тест пишется полностью: создать компонент, задать `@Input`, вызвать `detectChanges`, проверить вызов заглушки и DOM. `data-testid` на всех элементах управления.

- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать.** `dx-popup` с `[target]`, `dx-text-box` для поиска, `dx-list` с `selectionMode: 'multiple'` либо свой список с `dx-check-box` (проверить производительность на 5000 элементов; выбрать то, что не тормозит, и записать), `dx-date-box` с `[min]`, `[max]`, `displayFormat="dd.MM.yyyy"`, `dateSerializationFormat="yyyy-MM-dd"`, `dx-number-box`.
- [ ] **Step 4: Запустить** — PASS.
- [ ] **Step 5: Коммит** `feat(client): add column filter components`.

### Task 8: Клиент — грид: данные, колонки, сохранение, ошибки, метрики

**Files:**
- Create: `src/app/features/grid/grid-columns.ts`, `grid-state.ts` + `.spec.ts`, `grid-store.ts` + `.spec.ts`, `metrics-panel.component.ts`/`.html`, `src/app/core/grid-metrics.service.ts` + `.spec.ts`
- Modify: `src/app/features/grid/grid.component.ts`/`.html`, `grid.module.ts`

**Interfaces:**
- Consumes: `DataService`, `StorageService`, `DemoFlagsService`.
- Produces:

```ts
export interface GridColumnDef { field: string; caption: string; kind: ColumnKind; width: number; format?: string; }
export const GRID_COLUMNS: GridColumnDef[];

export interface GridPageSettings { dataset: DatasetSize; widthMode: 'fit' | 'scroll'; selectionMode: SelectionMode; }
export function stripVolatileState(state: DxGridState): DxGridState;       // вырезает filterValue
export function detachWidths(state: DxGridState): { state: DxGridState; widths: Record<string, number> };
export function attachWidths(state: DxGridState, widths: Record<string, number>): DxGridState;

export function createGridStore(data: DataService, onError: (e: ApiError) => void): CustomStore;

export class GridMetricsService {
  firstRenderMs$, sortMs$, filterMs$, fps$, minFps$: Observable<number | null>;
  markStart(kind: 'first-render' | 'sort' | 'filter'): void;
  markContentReady(): void;
  startFpsWhileScrolling(scrollable: HTMLElement): () => void;
}
```

- [ ] **Step 1: Падающие тесты.** `grid-state`: `filterValue` вырезан; отложенные ширины возвращаются; мусор в хранилище даёт значения по умолчанию. `GridMetricsService` (подмена `performance.now`): `sort` измеряется только между `markStart` и `markContentReady`; два `markStart` подряд берут последний; FPS считается за секунду. `grid-store` (заглушка `DataService`):

```ts
it('load пробрасывает результат', ...);
it('отменённый запрос не вызывает onError и не роняет promise', ...);
it('ошибка вызывает onError и отклоняет promise', ...);
it('totalCount и groupCount попадают в результат', ...);
```

- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать страницу.** Конфигурация раздела 6 спецификации: `remoteOperations`, `paging`, `pager`, `columnFixing`, `allowColumnReordering`, `allowColumnResizing`, `columnChooser`, `sorting.mode`, `stateStoring` (`type: 'custom'`, `savingTimeout: 0`), `loadPanel`, `dateSerializationFormat`, `filterPanel.visible: false`, `headerFilter.visible: false`. Панель переключателей: размер набора (сброс на первую страницу), режим ширины, «Задержка ответа», «Ошибка сервера», «Сбросить настройки». Полоска ошибки с «Повторить» (`grid.instance.refresh()`). Сохранение: `ngOnDestroy` и `beforeunload` (`grid.instance.state()`). Якоря: `id="pagination"`, `id="columns"`, `id="filters"`, `id="selection"`, `id="templates"`, `id="grouping"`, `id="export"`, `id="metrics"`.
- [ ] **Step 4: Запустить** `npm test`, `npm run build` — PASS.
- [ ] **Step 5: Проверка в браузере** (`npm run mock` + `npm start`): страница грузится, запрос `take=20`, сортировка, перемещение, закрепление, ширина, chooser, F5 возвращает страницу и колонки, уход в другой раздел и возврат возвращает их же; «Ошибка сервера» показывает полоску; «Задержка» + быстрое листание показывает отменённые запросы в сети и счётчик; нет ошибок в консоли, кроме W0019.
- [ ] **Step 6: Коммит** `feat(grid): add data binding, columns, persistence and metrics`.

### Task 9: Клиент — фильтры в гриде

**Files:**
- Create: `src/app/features/grid/filter-chips.component.ts`/`.html`, `.spec.ts`, `grid-filter-state.service.ts` + `.spec.ts`
- Modify: `grid.component.ts`/`.html`

**Interfaces:**
- Consumes: `ColumnFilterPopupComponent`, `buildFilterExpression`, `StorageService`.
- Produces: `GridFilterStateService { state$: Observable<GridFilterState>; snapshot: GridFilterState; set(field, value|null): void; clearAll(): void; }`, сохраняет в `dxgrid-demo:filters`.

- [ ] **Step 1: Падающие тесты.** Сервис: `set` пишет в хранилище; восстанавливает из него; `null` удаляет колонку. Чипы: подпись по текстам значений; `×` снимает фильтр; для диапазона показывает «с … по …» в формате `dd.MM.yyyy`.
- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать.** `headerCellTemplate` для всех колонок данных: подпись + кнопка-иконка `dx-icon-filter` с `data-testid="filter-<field>"`, `stopPropagation` на клике, подсветка при `isColumnFilterActive`. `[filterValue]` = `buildFilterExpression(state)`; `markStart('filter')` перед изменением. Тексты значений для чипов хранить в состоянии (`labels?: Record<string,string>` в `ColumnFilterState`), расширив модель, если нужно.
- [ ] **Step 4: Запустить** — PASS.
- [ ] **Step 5: Проверка в браузере:** для `plant`, `status`, `date`, `netWeight`, `markingCode`: список с сервера, статусы русские, даты `dd.MM.yyyy`, диапазон в том же popup; выбрать завод, открыть «Линия» — только линии завода; F5 фильтры на месте; закреплённая колонка показывает иконку в обеих копиях заголовка.
- [ ] **Step 6: Коммит** `feat(grid): wire excel-like column filters`.

### Task 10: Клиент — выбор и копирование

**Files:**
- Create: `src/app/features/grid/cell-selection.ts` + `.spec.ts`, `clipboard-format.ts` + `.spec.ts`, `clipboard.service.ts`
- Modify: `grid.component.ts`/`.html`

**Interfaces:**
- Produces:

```ts
export interface CellKey { rowKey: number; field: string; }
export class CellSelection {
  click(cell: CellKey, mods: { ctrl: boolean; shift: boolean }, order: { rowKeys: number[]; fields: string[] }): void;
  has(cell: CellKey): boolean;
  clear(): void;
  readonly cells: CellKey[];
}
export function toExcelText(header: string[], rows: string[][]): string;
export function selectionOptions(mode: SelectionMode): { mode: 'none' | 'single' | 'multiple'; showCheckBoxesMode: 'always' | 'none' };
```

- [ ] **Step 1: Падающие тесты**

```ts
it('разделители Excel', () => expect(toExcelText(['A', 'B'], [['1', '2']])).toBe('A\tB\r\n1\t2'));
it('экранирует кавычки и переводы строк', () =>
  expect(toExcelText(['A'], [['x"y\nz']])).toBe('A\r\n"x""y\nz"'));
it('значение с табуляцией берётся в кавычки', () =>
  expect(toExcelText(['A'], [['x\ty']])).toBe('A\r\n"x\ty"'));
it('пять режимов', () => {
  expect(selectionOptions('none').mode).toBe('none');
  expect(selectionOptions('row').mode).toBe('single');
  expect(selectionOptions('multi-checkbox')).toEqual({ mode: 'multiple', showCheckBoxesMode: 'always' });
  expect(selectionOptions('multi-plain')).toEqual({ mode: 'multiple', showCheckBoxesMode: 'none' });
  expect(selectionOptions('cells').mode).toBe('none');
});
it('Shift выделяет прямоугольник', () => {
  const s = new CellSelection(); const order = { rowKeys: [1, 2, 3], fields: ['a', 'b'] };
  s.click({ rowKey: 1, field: 'a' }, { ctrl: false, shift: false }, order);
  s.click({ rowKey: 3, field: 'b' }, { ctrl: false, shift: true }, order);
  expect(s.cells.length).toBe(6);
});
it('Ctrl переключает ячейку', () => {
  const s = new CellSelection(); const order = { rowKeys: [1], fields: ['a', 'b'] };
  s.click({ rowKey: 1, field: 'a' }, { ctrl: false, shift: false }, order);
  s.click({ rowKey: 1, field: 'b' }, { ctrl: true, shift: false }, order);
  s.click({ rowKey: 1, field: 'a' }, { ctrl: true, shift: false }, order);
  expect(s.cells).toEqual([{ rowKey: 1, field: 'b' }]);
});
it('клик без модификаторов сбрасывает выделение', ...);
```

- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать.** Переключатель пяти режимов, сохранён в `dxgrid-demo:selection-mode`. Смена режима очищает выделение. Выбранные строки при копировании берутся из текущей страницы (для ключей с других страниц — `getSelectedRowsData`; при `selectAll` на большом наборе — отказ с понятным сообщением либо загрузка, зафиксировать по факту). `Ctrl+C` на контейнере грида. `ClipboardService`: `navigator.clipboard.writeText`, запасной путь `textarea` + `execCommand('copy')` (HTTP на PL-Test).
- [ ] **Step 4: Запустить** — PASS.
- [ ] **Step 5: Проверка в браузере:** все пять режимов; копирование и чтение через `navigator.clipboard.readText` либо вставка в `textarea` страницы; TSV корректен.
- [ ] **Step 6: Коммит** `feat(grid): add selection modes and excel clipboard copy`.

### Task 11: Клиент — шаблоны ячеек

**Files:**
- Create: `src/app/features/grid/status-badge.component.ts` + `.spec.ts`, `labels-cell.component.ts`/`.html` + `.spec.ts`
- Modify: `grid.component.ts`/`.html`, `grid-columns.ts`

**Interfaces:**
- Consumes: `DataService.updateLabels`.
- Produces: `StatusBadgeComponent { @Input() status: number }`; `LabelsCellComponent { @Input() id: number; @Input() labels: string[]; @Output() labelsChange: EventEmitter<string[]> }`.

- [ ] **Step 1: Падающие тесты.** Бейдж: подпись и CSS-класс на каждый статус. Ярлыки: добавление вызывает `updateLabels` с новым списком; дубликат и пустая строка не отправляются; удаление отправляет список без ярлыка; ошибка возвращает прежний список и показывает ошибку; клик не передаётся строке (`stopPropagation`).
- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать.** Цвета через токены темы и CSS-классы. Колонка `type: 'buttons'` с иконками и подсказками, обработчик — `notify` с id записи. Колонка ярлыков: `allowSorting: false`, `allowGrouping: false`.
- [ ] **Step 4: Запустить** — PASS.
- [ ] **Step 5: Проверка в браузере:** бейдж, действия, добавить ярлык, F5 — ярлык на месте (хранится на сервере), фильтр по ярлыку.
- [ ] **Step 6: Коммит** `feat(grid): add status badge, actions and labels templates`.

### Task 12: Клиент — группировка и экспорт

**Files:**
- Create: `src/app/features/grid/export-request.ts` + `.spec.ts`, `native-export.ts`
- Create: `src/assets/fonts/DejaVuSans.ttf`
- Modify: `grid.component.ts`/`.html`, `package.json` (`exceljs` 4.3.0, `jspdf` 2.5.1, `file-saver` точная версия, `@types/file-saver` точная), `angular.json` (`allowedCommonJsDependencies`)

**Interfaces:**
- Produces: `buildExportRequest(grid: dxDataGrid, filter: FilterExpression | null): ExportRequest`, где `ExportRequest = { filter, sort, group, columns: { field, caption }[] }`; `estimatePdfPages(rowCount: number): number`.

- [ ] **Step 1: Падающие тесты** на заглушке грида: видимые колонки в порядке `visibleIndex`; скрытые и служебные (кнопки) не попадают; сортировка в порядке `sortIndex`; группа в порядке `groupIndex`; `estimatePdfPages(1000000)` = 22223.
- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать.** `groupPanel`, `grouping.autoExpandAll: false`, `summary` (`groupItems`, `totalItems`, подписи на русском), поля summary сверяются с сервером: группа по завод → линия, разворот, пагинация. Кнопки экспорта; индикатор на время; отмена; подтверждение перед PDF от 100 000 строк с оценкой страниц; имя файла с датой. Штатные кнопки: `exportDataGrid` из `devextreme/excel_exporter` и `devextreme/pdf_exporter`, для PDF шрифт регистрируется до экспорта.
- [ ] **Step 4: Запустить** — PASS.
- [ ] **Step 5: Проверка в браузере:** группировка на 1 млн; XLSX и PDF открываются и содержат все строки, русский текст, нужные колонки; штатный экспорт на 1 000, 100 000, 1 000 000 — замер (время, успех или отказ браузера) в `docs/measurements.md`.
- [ ] **Step 6: Коммит** `feat(grid): add server grouping and export`.

### Task 13: Настройки, О программе, Итоги

**Files:**
- Modify: `src/app/features/settings/*`, `src/app/features/about/*`
- Create: `src/app/models/requirement.model.ts`, `src/app/features/about/requirements.ts`, `score.ts` + `.spec.ts`, `src/app/features/settings/settings.component.spec.ts`, `scripts/count-loc.js`, `src/assets/loc.json`

**Interfaces:**
- Produces:

```ts
export type Assessment = 'штатно' | 'с доработкой' | 'не реализуется';
export interface Requirement {
  id: string; title: string; assessment: Assessment; locFiles: string[];
  apis: string[]; limitations: string; demoLink: string; extra?: boolean;
}
export function scoreOf(a: Assessment): 0 | 1 | 2;
export function totalScore(items: Requirement[]): { score: number; max: number };
```

- [ ] **Step 1: Падающие тесты.** `scoreOf`: 2, 1, 0; `totalScore` не считает `extra`; настройки: выводит ключи приложения со значениями, чужие ключи не выводит, значение JSON отформатировано.
- [ ] **Step 2: Запустить** — FAIL.
- [ ] **Step 3: Реализовать.** Настройки: таблица ключ/значение, «Обновить», «Удалить ключ», «Очистить всё». О программе: назначение, версии (читаются из `package.json` через `resolveJsonModule`), краткая инструкция. Итоги: таблица с колонками задания (колонка «Использованные API DevExtreme», примечание про Kendo), ссылка `routerLink`+`fragment`, балл внизу. `count-loc.js`: для каждого `locFiles` считает строки без пустых и комментариев, пишет `loc.json`; в `package.json` `"loc": "node scripts/count-loc.js"`. Если `.ts` файл не читается из `requirements.ts` напрямую, вынести список в `src/assets/requirements.json`.
- [ ] **Step 4: Заполнить оценки по факту,** глядя на `docs/measurements.md` и реальную работу, а не на ожидания спецификации.
- [ ] **Step 5: Запустить** `npm run loc`, `npm test` — PASS.
- [ ] **Step 6: Коммит** `feat: add settings, about and summary pages`.

### Task 14: README и TESTCASES

**Files:**
- Modify: `README.md`
- Create: `TESTCASES.md`

- [ ] **Step 1: README.** Разделы: назначение; требования к окружению (Node 24, .NET SDK 8+); установка (`npm ci`); запуск (`npm run mock`, `npm start`, адреса); тесты; лицензия по разделу 8 спецификации; точные версии всех пакетов npm и NuGet; генератор; результаты замеров; найденные ограничения; дополнения сверх задания; отклонения (XPO, Kendo → DevExtreme); публикация.
- [ ] **Step 2: TESTCASES.md.** Таблица: ID, требование, шаги, ожидаемый результат. Минимум один случай на каждую строку §3 задания, отдельно 1 000 и 1 000 000 строк. Не меньше 40 случаев.
- [ ] **Step 3: Сверка.** Каждая команда из README выполнена на чистом клоне: `git clone` во временную папку, `npm ci`, `npm test`, `npm run build`, `dotnet test`.
- [ ] **Step 4: Коммит** `docs: add readme and manual test cases`.

### Task 15: Приёмка в браузере

- [ ] **Step 1:** Запустить `npm run mock` + `npm start`, пройти `TESTCASES.md` на 1 000 и 1 000 000 строк, результаты записать в `docs/acceptance.md`.
- [ ] **Step 2:** Поиск по коду: `: any`, `as any`, `<any>`; оправданные случаи перечислить в README.
- [ ] **Step 3:** Найденные дефекты исправлять через superpowers:systematic-debugging с падающим тестом.
- [ ] **Step 4:** Обновить «Итоги», если проверка изменила оценки.
- [ ] **Step 5: Коммит** `test: record acceptance run`.

### Task 16: Публикация на PL-Test

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `scripts/deploy-pl-test.sh`
- Modify: `server/MockServer/Program.cs` (статика и fallback)
- Test: `server/MockServer.Tests/StaticFilesTests.cs`

- [ ] **Step 1: Падающий тест:** при наличии `wwwroot/index.html` неизвестный путь `/grid` возвращает `index.html`, `/api/unknown` — 404.
- [ ] **Step 2:** Запустить — FAIL. Реализовать. Запустить — PASS.
- [ ] **Step 3: Dockerfile.** Стадии: `node:24-slim` (`npm ci`, `npm run build`), `mcr.microsoft.com/dotnet/sdk:8.0` (`dotnet publish`), `mcr.microsoft.com/dotnet/aspnet:8.0` (клиент в `wwwroot`). `EXPOSE 5080`.
- [ ] **Step 4: Проверка локально,** если работает Docker; иначе сразу на сервере.
- [ ] **Step 5: Публикация.** Перед запуском проверить: порт 8095 свободен, контейнера с этим именем нет.

```bash
git archive --format=tar HEAD | ssh PL-Test 'mkdir -p /opt/devextreme-grid-demo && tar -xf - -C /opt/devextreme-grid-demo'
ssh PL-Test 'cd /opt/devextreme-grid-demo && docker build -t devextreme-grid-demo:latest . && docker rm -f devextreme-grid-demo 2>/dev/null; docker run -d --name devextreme-grid-demo --restart unless-stopped --memory=4g --cpus=3 -p 8095:5080 devextreme-grid-demo:latest'
```

- [ ] **Step 6: Проверка:** `curl http://82.38.66.177:8095/api/health` снаружи; браузер: загрузка грида, сортировка, фильтр, копирование (HTTP, запасной путь), экспорт. Соседние контейнеры продолжают работать (`docker ps`). Если порт закрыт файрволом, открыть только `8095/tcp`.
- [ ] **Step 7: Коммит** `chore: add docker image and pl-test deployment`.

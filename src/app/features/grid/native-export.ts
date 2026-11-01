import dxDataGrid from 'devextreme/ui/data_grid';

/**
 * Штатный экспорт DataGrid: `exportDataGrid` из `devextreme/excel_exporter`
 * и `devextreme/pdf_exporter` поверх exceljs и jspdf. Библиотеки и шрифт
 * подгружаются при первом экспорте, чтобы не тяжелить чанк грида. Данные
 * грид читает сам одним запросом без `take` (см. `createGridStore`).
 */

const FONT_URL = 'assets/fonts/DejaVuSans.ttf';
const FONT_FILE = 'DejaVuSans.ttf';
/** Имя шрифта в jsPDF; встроенные шрифты jsPDF кириллицу не содержат. */
export const PDF_FONT = 'DejaVuSans';
const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SHEET_NAME = 'Данные';
const CHUNK = 0x8000;

export async function exportGridToExcel(grid: dxDataGrid): Promise<Blob> {
  const [{ Workbook }, { exportDataGrid }] = await Promise.all([
    import('exceljs'),
    import('devextreme/excel_exporter'),
  ]);
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet(SHEET_NAME);
  await exportDataGrid({ component: grid, worksheet, autoFilterEnabled: true });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_TYPE });
}

export async function exportGridToPdf(grid: dxDataGrid): Promise<Blob> {
  const [{ jsPDF }, { exportDataGrid }, font] = await Promise.all([
    import('jspdf'),
    import('devextreme/pdf_exporter'),
    fetchFont(),
  ]);
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.addFileToVFS(FONT_FILE, font);
  doc.addFont(FONT_FILE, PDF_FONT, 'normal');
  doc.addFont(FONT_FILE, PDF_FONT, 'bold');
  doc.setFont(PDF_FONT);
  await exportDataGrid({
    jsPDFDocument: doc,
    component: grid,
    repeatHeaders: true,
  });
  return doc.output('blob');
}

/**
 * UMD-сборка file-saver экспортирует саму функцию: webpack отдаёт её как
 * `default`, свойства функции в пространство имён не копирует.
 */
export async function saveBlob(blob: Blob, fileName: string): Promise<void> {
  const fileSaver = await import('file-saver');
  const { saveAs } = (fileSaver as unknown as { default: typeof fileSaver })
    .default;
  saveAs(blob, fileName);
}

async function fetchFont(): Promise<string> {
  const response = await fetch(FONT_URL);
  if (!response.ok) {
    throw new Error(`Шрифт ${FONT_URL} не загружен: ${response.status}`);
  }
  return toBinaryString(await response.arrayBuffer());
}

/**
 * jsPDF принимает в `addFileToVFS` строку: бинарную (TTF начинается с
 * `\x00\x01\x00\x00`) или base64. `String.fromCharCode` на весь буфер
 * упирается в предел аргументов, поэтому кусками.
 */
export function toBinaryString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    parts.push(
      String.fromCharCode(...bytes.subarray(offset, offset + CHUNK))
    );
  }
  return parts.join('');
}

import express from 'express';
import ExcelJS from 'exceljs';

export const MAX_UPLOAD_ROWS = 2000;
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Accepts the uploaded .xlsx as the raw request body (no extra upload library needed). */
export const rawExcel = express.raw({ type: () => true, limit: '5mb' });

/** Plain text of a cell, whatever Excel stored (number, rich text, hyperlink, formula). */
export function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map((t) => t.text).join('').trim();
    if (value.text !== undefined) return cellText(value.text);
    if (value.result !== undefined) return cellText(value.result);
    return '';
  }
  return String(value).trim();
}

const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Reads the first sheet of an uploaded workbook.
 * Columns are found by their header text (any order); `columns` maps key -> accepted header names.
 * Returns { rows: [{ rowNumber, values: {key: text} }] } or { error }.
 */
export async function readUpload(buffer, columns) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { error: 'Choose an Excel (.xlsx) file to upload' };
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    return { error: 'Could not read the file. Upload an Excel .xlsx file (save as "Excel Workbook" if it is .xls or .csv).' };
  }
  const ws = wb.worksheets.find((s) => s.state !== 'hidden') || wb.worksheets[0];
  if (!ws) return { error: 'The file has no sheets' };

  // Header row: the first of the top 5 rows that contains every expected column.
  let headerRow = 0;
  let colOf = {};
  for (let r = 1; r <= Math.min(5, ws.rowCount) && !headerRow; r++) {
    const found = {};
    ws.getRow(r).eachCell((cell, col) => {
      const h = norm(cellText(cell.value));
      for (const [key, names] of Object.entries(columns)) {
        if (!found[key] && names.some((n) => norm(n) === h)) found[key] = col;
      }
    });
    if (Object.keys(found).length === Object.keys(columns).length) {
      headerRow = r;
      colOf = found;
    }
  }
  if (!headerRow) {
    const expected = Object.values(columns).map((n) => n[0]).join(', ');
    return { error: `Header row not found. The first row must have these columns: ${expected}` };
  }

  const rows = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values = {};
    for (const [key, col] of Object.entries(colOf)) values[key] = cellText(row.getCell(col).value);
    if (Object.values(values).every((v) => v === '')) continue; // blank line
    rows.push({ rowNumber: r, values });
  }
  if (!rows.length) return { error: 'The file has no data rows' };
  if (rows.length > MAX_UPLOAD_ROWS) return { error: `Too many rows (${rows.length}). Upload at most ${MAX_UPLOAD_ROWS} at a time.` };
  return { rows };
}

/**
 * Builds a one-sheet workbook. `extra` adds more sheets: [{ name, rows: string[][] , hidden? }].
 * `validations` adds dropdowns: [{ col: 'B', list: '"Tibb,Riyadah"' }].
 */
export async function buildWorkbook({ sheetName, headers, rows = [], widths = [], validations = [], extra = [] }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.columns = headers.map((h, i) => ({ header: h, key: String(i), width: widths[i] || 22 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  rows.forEach((r) => ws.addRow(r));
  for (const v of validations) {
    ws.dataValidations.add(`${v.col}2:${v.col}${Math.max(rows.length, 1) + 500}`, {
      type: 'list',
      allowBlank: true,
      formulae: [v.list],
      showErrorMessage: true,
      errorTitle: 'Invalid value',
      error: v.error || 'Choose a value from the list',
    });
  }
  for (const s of extra) {
    const sheet = wb.addWorksheet(s.name);
    s.rows.forEach((r) => sheet.addRow(r));
    sheet.getColumn(1).width = 30;
    if (s.bold) sheet.getRow(1).font = { bold: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function sendWorkbook(res, buffer, filename) {
  res.setHeader('Content-Type', XLSX_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

/** Yes/No cell -> true/false, or null when not recognised. */
export function yesNo(text) {
  const t = text.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', '✓'].includes(t)) return true;
  if (['no', 'n', 'false', '0', ''].includes(t)) return false;
  return null;
}

// Turns rows into CSV text that opens correctly in Excel.

// A cell starting with = + - @ can run as a formula in Excel ("CSV injection").
// We prefix a quote so it is shown as plain text instead.
const safeCell = (value) => {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// columns: [{ header: 'Date', value: (row) => ... }, ...]
export const toCsv = (rows, columns) => {
  const lines = [columns.map((c) => safeCell(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => safeCell(c.value(row))).join(','));
  }
  // BOM so Excel reads UTF-8 names correctly
  return `﻿${lines.join('\r\n')}\r\n`;
};

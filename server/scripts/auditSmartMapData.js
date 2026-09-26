// Read-only inventory; output lives outside the protected data directories.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';
import { classify } from '../services/omanData/importer.js';
const base = new URL('../data/', import.meta.url);
const inventory = [];
for (const directory of ['raw', 'processed']) {
  for (const name of (await readdir(new URL(`${directory}/`, base))).sort()) {
    const bytes = await readFile(new URL(`${directory}/${name}`, base));
    const item = { file: `${directory}/${name}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    if (name.endsWith('.xlsx')) {
      const book = XLSX.read(bytes, { type: 'buffer' });
      item.sheets = book.SheetNames.map(sheet => {
        const rows = XLSX.utils.sheet_to_json(book.Sheets[sheet], { header: 1, defval: null });
        const nonempty = rows.filter(r => r.some(c => c !== null && c !== ''));
        const kind = nonempty.length ? classify(rows) : 'empty/chart-only';
        return { sheet, kind, nonemptyRows: nonempty.length, firstRows: nonempty.slice(0, 2),
          ...(kind === 'metadata' ? { metadata: nonempty } : {}) };
      });
    } else {
      const rows = name.endsWith('.json') ? JSON.parse(bytes) : parse(bytes, { columns: true, bom: true });
      item.rows = rows.length; item.columns = Object.keys(rows[0] ?? {});
    }
    inventory.push(item);
  }
}
await writeFile(new URL('../SMART_MAP_DATA_INVENTORY.json', import.meta.url), JSON.stringify(inventory, null, 2));
console.log(JSON.stringify(inventory.map(({ file, rows, sheets }) => ({ file, rows, sheets: sheets?.map(s => ({ sheet: s.sheet, kind: s.kind, nonemptyRows: s.nonemptyRows })) })), null, 2));

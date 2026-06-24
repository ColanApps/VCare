/**
 * Fix pageToolbar imports and broken macro argument syntax after batch migrate.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagesDir = path.join(__dirname, '../src/views/pages');

function walk(dir, files = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name.endsWith('.njk')) files.push(p);
  }
  return files;
}

function ensureImport(content) {
  if (content.includes('import pageToolbar')) return content;
  if (!content.includes('call pageToolbar')) return content;
  const importLine = '{% from "macros/ui.njk" import pageToolbar %}';
  const uiImport = content.match(/{% from "macros\/ui\.njk" import ([^%]+) %}/);
  if (uiImport) {
    const names = uiImport[1].split(',').map((s) => s.trim());
    if (!names.includes('pageToolbar')) {
      names.push('pageToolbar');
      return content.replace(uiImport[0], `{% from "macros/ui.njk" import ${names.join(', ')} %}`);
    }
    return content;
  }
  const compImport = content.match(/{% from "macros\/components\.njk" import [^%]+ %}/);
  if (compImport) {
    return content.replace(compImport[0], `${compImport[0]}\n${importLine}`);
  }
  const partialImport = content.match(/{% from "partials\/[^"]+" import [^%]+ %}/);
  if (partialImport) {
    return content.replace(partialImport[0], `${partialImport[0]}\n${importLine}`);
  }
  return content.replace(/({% extends [^%]+%})/, `$1\n${importLine}`);
}

const fixes = [
  // Portal / report period subtitles
  [
    /{% call pageToolbar\('Accounts Portal', \{\{ period\.start \| date \}\} – \{\{ period\.end \| date \}\}\) %}/,
    "{% call pageToolbar('Accounts Portal', period.start | date ~ ' – ' ~ period.end | date) %}",
  ],
  [
    /{% call pageToolbar\('Corporate Overview', \{\{ period\.start \| date \}\} – \{\{ period\.end \| date \}\}\) %}/,
    "{% call pageToolbar('Corporate Overview', period.start | date ~ ' – ' ~ period.end | date) %}",
  ],
  [
    /{% call pageToolbar\('Branch Comparison', \{\{ period\.start \| date \}\} – \{\{ period\.end \| date \}\}\) %}/,
    "{% call pageToolbar('Branch Comparison', period.start | date ~ ' – ' ~ period.end | date) %}",
  ],
  [
    /{% call pageToolbar\('Day Wise GST Report', \{\{ period\.start \| date \}\} – \{\{ period\.end \| date \}\}\) %}/,
    "{% call pageToolbar('Day Wise GST Report', period.start | date ~ ' – ' ~ period.end | date) %}",
  ],
  [
    /{% call pageToolbar\('GST Report — B2B', Corporate \/ B2B invoices · \{\{ period\.start \| date \}\} – \{\{ period\.end \| date \}\}\) %}/,
    "{% call pageToolbar('GST Report — B2B', 'Corporate / B2B invoices · ' ~ period.start | date ~ ' – ' ~ period.end | date) %}",
  ],
  [
    /{% call pageToolbar\('GST Report — B2C', Center & online consumer bills · \{\{ period\.start \| date \}\} – \{\{ period\.end \| date \}\}\) %}/,
    "{% call pageToolbar('GST Report — B2C', 'Center & online consumer bills · ' ~ period.start | date ~ ' – ' ~ period.end | date) %}",
  ],
  [
    /{% call pageToolbar\('Quality Check — \{\{ grn\.grnNo \}\}', PO \{\{ grn\.po\.poNo \}\} · \{\{ grn\.po\.vendor\.name \}\}\) %}/,
    "{% call pageToolbar('Quality Check — ' ~ grn.grnNo, 'PO ' ~ grn.po.poNo ~ ' · ' ~ grn.po.vendor.name) %}",
  ],
  [
    /{% call pageToolbar\('\{\{ stockType == 'CLINICAL' and 'Clinical Center Stock' or 'Billable Center Stock' \}\}'\) %}/,
    "{% call pageToolbar(stockType == 'CLINICAL' and 'Clinical Center Stock' or 'Billable Center Stock') %}",
  ],
  [
    /{% call pageToolbar\('\{\{ customer\.firstName \}\} \{\{ customer\.lastName \}\}'\) %}/,
    "{% call pageToolbar(customer.firstName ~ ' ' ~ customer.lastName) %}",
  ],
  [
    /{% call pageToolbar\('Bill \{\{ bill\.billNo \}\}'\) %}/,
    "{% call pageToolbar('Bill ' ~ bill.billNo) %}",
  ],
];

let importFixed = 0;
let syntaxFixed = 0;

for (const file of walk(pagesDir)) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;

  for (const [re, replacement] of fixes) {
    if (re.test(content)) {
      content = content.replace(re, replacement);
      syntaxFixed++;
    }
  }

  const withImport = ensureImport(content);
  if (withImport !== content) {
    content = withImport;
    importFixed++;
  }

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
  }
}

console.log(`Fixed imports on ${importFixed} files, syntax on ${syntaxFixed} replacements`);

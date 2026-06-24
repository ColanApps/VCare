/**
 * Batch migrate list/report pages: pageToolbar + erp-table-card + erp-empty-cell
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

function ensurePageToolbarImport(content) {
  if (content.includes('import pageToolbar')) return content;
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
  return content.replace(/({% extends [^%]+%})/, `$1\n${importLine}`);
}

function extractTitle(text) {
  return text.replace(/\{\{[^}]+\}\}/g, (m) => m).trim();
}

function migrateContent(content, filePath) {
  if (content.includes('{% call pageToolbar(') || content.includes('{% call pageToolbar (')) {
    return { content, changed: false };
  }
  if (!content.includes('erp-table') && !content.includes('<table')) {
    return { content, changed: false };
  }

  let out = content;
  let changed = false;

  // Portal title + subtitle
  const portalMatch = out.match(
    /<h1 class="text-2xl font-bold[^"]*">([^<]+)<\/h1>\s*<p class="text-sm text-slate-500 mb-6">([^<]+)<\/p>/
  );
  if (portalMatch) {
    const title = extractTitle(portalMatch[1]);
    const sub = portalMatch[2].trim();
    out = out.replace(
      portalMatch[0],
      `{% call pageToolbar('${title}', ${sub.includes('{{') ? sub.replace(/^/, '').replace(/ mb-6$/, '') : `'${sub}'`}) %}\n{% endcall %}`
    );
    changed = true;
  }

  // Portal title only
  if (!changed) {
    const portalOnly = out.match(/<h1 class="text-2xl font-bold[^"]*">([^<]+)<\/h1>/);
    if (portalOnly) {
      const title = extractTitle(portalOnly[1]);
      out = out.replace(portalOnly[0], `{% call pageToolbar('${title}') %}\n{% endcall %}`);
      changed = true;
    }
  }

  // Flex wrapper with h1
  const flexH1 = out.match(
    /<div class="flex items-center justify-between mb-6">\s*<h1 class="erp-page-title">([^<]+)<\/h1>\s*([\s\S]*?)<\/div>/
  );
  if (flexH1 && !changed) {
    const title = extractTitle(flexH1[1]);
    const inner = flexH1[2].trim();
    const actions = inner ? `\n  ${inner}\n` : '\n';
    out = out.replace(flexH1[0], `{% call pageToolbar('${title}') %}${actions}{% endcall %}`);
    changed = true;
  }

  // h1 mb-2 + optional period line (keep reportPeriodFilter after toolbar)
  const h1Mb2 = out.match(/<h1 class="erp-page-title mb-2">([^<]+)<\/h1>\s*\n<p class="text-sm text-slate-500 mb-6">([^<]+)<\/p>/);
  if (h1Mb2 && !changed) {
    const title = extractTitle(h1Mb2[1]);
    const sub = h1Mb2[2].trim();
    out = out.replace(h1Mb2[0], `{% call pageToolbar('${title}', ${sub}) %}\n{% endcall %}`);
    changed = true;
  }

  // h1 mb-6 or mb-2 alone
  if (!changed) {
    const h1Simple = out.match(/<h1 class="erp-page-title mb-[26]">([^<]+)<\/h1>/);
    if (h1Simple) {
      const title = extractTitle(h1Simple[1]);
      out = out.replace(h1Simple[0], `{% call pageToolbar('${title}') %}\n{% endcall %}`);
      changed = true;
    }
  }

  if (!changed) {
    const h1Plain = out.match(/<h1 class="erp-page-title">([^<]+)<\/h1>/);
    if (h1Plain) {
      const title = extractTitle(h1Plain[1]);
      out = out.replace(h1Plain[0], `{% call pageToolbar('${title}') %}\n{% endcall %}`);
      changed = true;
    }
  }

  if (!changed) return { content, changed: false };

  out = ensurePageToolbarImport(out);

  // erp-table-card on cards with tables (not already)
  out = out.replace(/<div class="erp-card">(\s*(?:<div class="erp-card-header">[\s\S]*?<\/div>\s*)?(?:<div class="overflow-x-auto">\s*)?<table class="erp-table")/g, (m, g1) => {
    if (m.includes('erp-table-card')) return m;
    return `<div class="erp-card erp-table-card">${g1}`;
  });

  out = out.replace(/<div class="erp-card mb-6">(\s*<form[\s\S]*?<\/form>\s*<\/div>\s*<div class="erp-card)/g, (m) => {
    if (m.includes('erp-filter-bar')) return m;
    return m.replace('<div class="erp-card mb-6">', '<div class="erp-filter-bar mb-6">').replace('class="erp-card-body"', 'class=""');
  });

  // Filter card → erp-filter-bar (simple GET forms)
  out = out.replace(
    /<div class="erp-card mb-6">\s*<form method="GET"([^>]*)class="erp-card-body"/g,
    '<div class="erp-filter-bar mb-6"><form method="GET"$1class=""'
  );
  out = out.replace(/<\/form>\s*<\/div>\s*\n<div class="erp-card erp-table-card">/g, '</form></div>\n\n<div class="erp-card erp-table-card">');

  // Empty cells
  out = out.replace(/class="text-center text-slate-400 py-8"/g, 'class="erp-empty-cell"');
  out = out.replace(/class="text-center text-slate-400 py-4"/g, 'class="erp-empty-cell"');
  out = out.replace(/class="text-center text-slate-400 py-6"/g, 'class="erp-empty-cell"');

  // KPI grids on portal/dashboard list pages
  out = out.replace(
    /<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">/g,
    '<div class="erp-kpi-grid">'
  );
  out = out.replace(
    /<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">/g,
    '<div class="erp-kpi-grid erp-kpi-grid-auto mb-6" style="grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));">'
  );

  return { content: out, changed: true };
}

const files = walk(pagesDir);
let updated = 0;
const updatedFiles = [];

for (const file of files) {
  const rel = path.relative(pagesDir, file);
  // Skip generic templates, error, already migrated hubs
  if (rel.startsWith('generic/') || rel === 'error.njk') continue;
  if (['dashboard/index.njk', 'dashboard/my-tasks.njk', 'dashboard/role-home.njk', 'call-center/index.njk', 'finance/index.njk', 'reports/sales.njk'].includes(rel.replace(/\\/g, '/'))) continue;

  const original = fs.readFileSync(file, 'utf8');
  const { content, changed } = migrateContent(original, file);
  if (changed && content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    updated++;
    updatedFiles.push(rel);
  }
}

console.log(`Updated ${updated} files:`);
updatedFiles.forEach((f) => console.log('  -', f));

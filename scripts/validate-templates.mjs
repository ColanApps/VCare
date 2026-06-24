#!/usr/bin/env node
/**
 * Parse every Nunjucks view — fails fast on template syntax errors.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nunjucks from 'nunjucks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const viewsRoot = path.join(__dirname, '..', 'src', 'views');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(full));
    else if (e.name.endsWith('.njk')) files.push(full);
  }
  return files;
}

const env = nunjucks.configure(viewsRoot, { autoescape: true, noCache: true });
const files = walk(viewsRoot).sort();
const errors = [];

for (const file of files) {
  const rel = path.relative(viewsRoot, file).replace(/\\/g, '/');
  try {
    env.getTemplate(rel);
  } catch (err) {
    errors.push({ file: rel, message: err.message });
  }
}

if (errors.length) {
  console.error(`Template validation failed (${errors.length} file(s)):\n`);
  for (const e of errors) {
    console.error(`  ${e.file}\n    ${e.message}\n`);
  }
  process.exit(1);
}

console.log(`OK — ${files.length} templates parsed without syntax errors.`);

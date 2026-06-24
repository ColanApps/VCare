/**
 * Fix double-closed table card wrappers: </div></div> after </table> with extra parent </div>
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

const badPattern = /(<\/table>\s*)\n\s*<\/div><\/div>\s*\n(\s*)<\/div>/g;
const goodReplacement = '$1\n$2</div>\n$2</div>';

let fixed = 0;
for (const file of walk(pagesDir)) {
  let content = fs.readFileSync(file, 'utf8');
  const next = content.replace(badPattern, goodReplacement);
  if (next !== content) {
    fs.writeFileSync(file, next, 'utf8');
    fixed++;
    console.log('Fixed:', path.relative(pagesDir, file));
  }
}
console.log('Total fixed:', fixed);

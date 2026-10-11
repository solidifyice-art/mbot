'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'dist', 'build']);
const CHECK_DIRS = ['.', 'src', 'scripts', 'test'];

function collect(dir, out) {
  const absolute = path.resolve(dir);
  if (!fs.existsSync(absolute)) return;

  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      collect(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.add(full);
    }
  }
}

function main() {
  const files = new Set();
  for (const dir of CHECK_DIRS) collect(dir, files);

  const errors = [];
  for (const file of [...files].sort()) {
    const source = fs.readFileSync(file, 'utf8');
    try {
      // Compiling catches syntax errors without executing module code.
      new vm.Script(source, { filename: file });
    } catch (err) {
      errors.push(`${path.relative(process.cwd(), file)}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.error(`Syntax check failed for ${errors.length} file(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Syntax check passed for ${files.size} file(s).`);
}

main();

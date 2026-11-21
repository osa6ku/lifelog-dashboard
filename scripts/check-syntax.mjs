import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const targets = [
  ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => path.join('js', f)),
  'sw.js',
  ...fs.readdirSync(path.join(root, 'gas')).filter(f => f.endsWith('.gs')).map(f => path.join('gas', f)),
];

let failed = 0;
for (const rel of targets) {
  const full = path.join(root, rel);
  const src = fs.readFileSync(full, 'utf8');
  try {
    new vm.Script(src, { filename: rel });
  } catch (err) {
    console.error(`SYNTAX ERROR in ${rel}: ${err.message}`);
    failed++;
  }
}

if (failed > 0) {
  process.exit(1);
}
console.log(`Syntax OK (${targets.length} files checked).`);

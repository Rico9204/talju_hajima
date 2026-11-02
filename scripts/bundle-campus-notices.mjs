import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outPath = resolve('api/campus-notices.js');
console.log('Running esbuild via npx...');
execSync('npx esbuild src/server/campus-notices.ts --bundle --platform=node --format=esm --outfile=api/campus-notices.js', {
  stdio: 'inherit',
  shell: true
});

const content = readFileSync(outPath, 'utf8');
const banner = `import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);\n`;
if (!content.startsWith(banner)) {
  writeFileSync(outPath, banner + content, 'utf8');
  console.log('Prepended banner to api/campus-notices.js');
}

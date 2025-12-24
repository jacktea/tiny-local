import { existsSync } from 'fs';
import { execSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'web', 'pkg', 'tinylocal.js');

if (!existsSync(pkgPath)) {
  console.log('[dev] wasm pkg missing. Building with wasm-pack...');
  execSync('wasm-pack build rust --target web --out-dir web/pkg --release', {
    stdio: 'inherit',
    cwd: root,
  });
}

const viteBin = process.platform === 'win32' ? 'vite.cmd' : 'vite';
const vitePath = path.join(root, 'node_modules', '.bin', viteBin);

const child = spawn(vitePath, [], {
  stdio: 'inherit',
  cwd: root,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

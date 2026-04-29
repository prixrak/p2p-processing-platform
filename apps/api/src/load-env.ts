/**
 * Load `.env` for the API process. Monorepo runs vary by cwd (apps/api vs repo root vs debugger).
 * 1) Always try repo-root `.env` relative to this file (`apps/api/src` → three levels up).
 * 2) Walk from `process.cwd()` up the filesystem and merge each `.env` (deeper paths override).
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const envBesideMonorepoRoot = resolve(__dirname, '../../../.env');
if (existsSync(envBesideMonorepoRoot)) {
  loadDotenv({ path: envBesideMonorepoRoot });
}

let dir = resolve(process.cwd());
const ancestorDirs: string[] = [];
for (let i = 0; i < 24; i++) {
  ancestorDirs.push(dir);
  const parent = resolve(dir, '..');
  if (parent === dir) {
    break;
  }
  dir = parent;
}

for (let i = ancestorDirs.length - 1; i >= 0; i--) {
  const envPath = resolve(ancestorDirs[i], '.env');
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath, override: true });
  }
}

// Always test a fresh single-file build.
import { execFileSync } from 'node:child_process';
export default function globalSetup() {
  execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
}

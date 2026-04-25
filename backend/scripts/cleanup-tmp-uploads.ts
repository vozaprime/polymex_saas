import { promises as fsp, Dirent } from 'fs';
import * as path from 'path';

// FIX (3): delete orphan tmp files older than 24 h.
// Run via: npm run cleanup:tmp

const TMP_DIR = path.join(process.cwd(), 'uploads', 'products', 'tmp');
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await fsp.readdir(TMP_DIR, { withFileTypes: true });
  } catch {
    console.log(`Tmp directory not found or empty: ${TMP_DIR}`);
    return;
  }

  const now = Date.now();
  let deleted = 0;
  let errors = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const filePath = path.join(TMP_DIR, entry.name);
    try {
      const stat = await fsp.stat(filePath);
      if (now - stat.mtimeMs > MAX_AGE_MS) {
        await fsp.unlink(filePath);
        console.log(`Deleted: ${entry.name}`);
        deleted++;
      }
    } catch (e) {
      console.error(`Error processing ${entry.name}:`, e);
      errors++;
    }
  }

  console.log(`Cleanup complete — deleted: ${deleted}, errors: ${errors}`);
}

main().catch((e: unknown) => {
  console.error('Fatal error:', e);
  process.exit(1);
});

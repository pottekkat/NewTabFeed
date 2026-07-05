// Shared test helpers.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

/** Read a fixture file from tests/fixtures/ as a UTF-8 string. */
export function fixture(name: string): string {
  return readFileSync(join(here, 'fixtures', name), 'utf-8');
}

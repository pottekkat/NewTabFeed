// IndexedDB test wiring.
//
// fakeBrowser (from WxtVitest) does NOT provide IndexedDB, so db-layer tests use
// fake-indexeddb instead. Importing 'fake-indexeddb/auto' installs `indexedDB`
// and `IDBKeyRange` on globalThis. `resetIndexedDB()` gives each test a clean
// database by swapping in a fresh factory (and dropping the memoized connection).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { closeDB } from '@/lib/db';

export async function resetIndexedDB(): Promise<void> {
  await closeDB();
  globalThis.indexedDB = new IDBFactory();
}

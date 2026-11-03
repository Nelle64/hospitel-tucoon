/** Minimal promise wrapper around IndexedDB (works with fake-indexeddb in tests). */
export const DB_NAME = 'pixel-hospital';
export const DB_VERSION = 1;
export type StoreName = 'snapshots' | 'campaigns' | 'settings' | 'kv';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

export class KeyValueDB {
  private constructor(private db: IDBDatabase) {}

  static async open(name = DB_NAME, factory: IDBFactory = globalThis.indexedDB): Promise<KeyValueDB> {
    if (!factory) throw new Error('IndexedDB saknas i den här webbläsaren');
    const open = factory.open(name, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'saveId' });
      if (!db.objectStoreNames.contains('campaigns')) db.createObjectStore('campaigns', { keyPath: 'campaignId' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    const db = await req(open);
    return new KeyValueDB(db);
  }

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const tx = this.db.transaction(store, 'readonly');
    return (await req(tx.objectStore(store).get(key))) as T | undefined;
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    const tx = this.db.transaction(store, 'readonly');
    return (await req(tx.objectStore(store).getAll())) as T[];
  }

  async put(store: StoreName, value: unknown): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
    });
  }

  async delete(store: StoreName, key: IDBValidKey): Promise<void> {
    const tx = this.db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    });
  }

  close(): void {
    this.db.close();
  }
}

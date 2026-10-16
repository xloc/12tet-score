import type { Score } from './music';

export type LocalScore = { id: string; score: Score };

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Local score storage is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open('music-sheet-library', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('scores', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction('scores', mode);
      const request = action(transaction.objectStore('scores'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Local score storage failed.'));
    });
  } finally {
    database.close();
  }
}

export function listLocalScores() {
  return transact<LocalScore[]>('readonly', (store) => store.getAll());
}

export async function readLocalScore(id: string) {
  const entry = await transact<LocalScore | undefined>('readonly', (store) => store.get(id));
  if (!entry) throw new Error('This imported score is no longer in your library.');
  return entry.score;
}

export async function saveLocalScores(entries: LocalScore[]) {
  if (!entries.length) return;
  await transact('readwrite', (store) => {
    let request = store.add(entries[0]!);
    for (const entry of entries.slice(1)) request = store.add(entry);
    return request;
  });
}

export async function deleteLocalScore(id: string) {
  await transact('readwrite', (store) => store.delete(id));
}

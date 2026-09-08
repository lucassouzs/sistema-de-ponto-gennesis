import type { GastosOperacionaisTotvsQueryData } from './fetchGastosOperacionaisTotvs';

const STORAGE_KEY = 'gastos-operacionais-totvs-cache-v1';
const IDB_NAME = 'gennesis-gastos-operacionais';
const IDB_STORE = 'cache';
const IDB_VERSION = 1;

/** Descarta cache em disco mais antigo que isto. */
export const GASTOS_OPERACIONAIS_TOTVS_PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type PersistedPayload = {
  savedAt: number;
  data: GastosOperacionaisTotvsQueryData;
};

export type GastosOperacionaisTotvsPersisted = {
  data: GastosOperacionaisTotvsQueryData;
  updatedAt: number;
};

function isValidData(data: unknown): data is GastosOperacionaisTotvsQueryData {
  if (!data || typeof data !== 'object') return false;
  const row = data as GastosOperacionaisTotvsQueryData;
  return (
    Array.isArray(row.detailRows) &&
    Array.isArray(row.naturezaDetailRows) &&
    Array.isArray(row.totvsNaturezaCatalog) &&
    typeof row.fetchedAt === 'string'
  );
}

function parsePayload(raw: unknown): GastosOperacionaisTotvsPersisted | null {
  if (!raw || typeof raw !== 'object') return null;
  const parsed = raw as PersistedPayload;
  if (!isValidData(parsed.data)) return null;

  const updatedAt =
    typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
      ? parsed.savedAt
      : Date.parse(parsed.data.fetchedAt);

  if (!Number.isFinite(updatedAt)) return null;
  if (Date.now() - updatedAt > GASTOS_OPERACIONAIS_TOTVS_PERSIST_MAX_AGE_MS) {
    return null;
  }

  return { data: parsed.data, updatedAt };
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function idbGet(): Promise<PersistedPayload | null> {
  const db = await openIdb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(STORAGE_KEY);
      req.onsuccess = () => resolve((req.result as PersistedPayload | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
    });
  } finally {
    db.close();
  }
}

async function idbSet(payload: PersistedPayload): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(payload, STORAGE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('IndexedDB put failed'));
    });
  } finally {
    db.close();
  }
}

async function idbDelete(): Promise<void> {
  const db = await openIdb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.delete(STORAGE_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('IndexedDB delete failed'));
    });
  } finally {
    db.close();
  }
}

/** Leitura síncrona (localStorage) — pode falhar se o payload for grande. */
export function readGastosOperacionaisTotvsPersistedSync(): GastosOperacionaisTotvsPersisted | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parsePayload(JSON.parse(raw) as PersistedPayload);
  } catch {
    return null;
  }
}

/** Leitura completa: IndexedDB (principal) + fallback localStorage. */
export async function readGastosOperacionaisTotvsPersisted(): Promise<GastosOperacionaisTotvsPersisted | null> {
  if (typeof window === 'undefined') return null;

  try {
    if (window.indexedDB) {
      const fromIdb = parsePayload(await idbGet());
      if (fromIdb) return fromIdb;
    }
  } catch {
    // segue para localStorage
  }

  return readGastosOperacionaisTotvsPersistedSync();
}

export async function writeGastosOperacionaisTotvsPersisted(
  data: GastosOperacionaisTotvsQueryData
): Promise<void> {
  if (typeof window === 'undefined') return;

  const payload: PersistedPayload = { savedAt: Date.now(), data };

  let idbOk = false;
  try {
    if (window.indexedDB) {
      await idbSet(payload);
      idbOk = true;
    }
  } catch {
    idbOk = false;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota — se IndexedDB salvou, ok; senão não há cache síncrono
    if (!idbOk) {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }
}

export async function clearGastosOperacionaisTotvsPersisted(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    if (window.indexedDB) await idbDelete();
  } catch {
    // ignore
  }
}

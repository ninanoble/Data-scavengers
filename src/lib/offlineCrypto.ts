import { openDB, type IDBPDatabase } from 'idb';

const CRYPTO_DB_NAME = 'data-scavengers-keystore';
const KEY_STORE = 'keys';
const DEVICE_KEY_ID = 'device-aes-gcm-256';

interface EncryptedPayload {
  iv: number[];
  ciphertext: number[];
  version: 1;
}

let cachedKey: CryptoKey | null = null;

async function getKeyDB(): Promise<IDBPDatabase> {
  return openDB(CRYPTO_DB_NAME, 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(KEY_STORE)) {
        database.createObjectStore(KEY_STORE);
      }
    },
  });
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Web Crypto API is unavailable in this environment.');
  }

  const db = await getKeyDB();
  const existing = (await db.get(KEY_STORE, DEVICE_KEY_ID)) as CryptoKey | undefined;
  if (existing) {
    cachedKey = existing;
    return existing;
  }

  const key = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  await db.put(KEY_STORE, key, DEVICE_KEY_ID);
  cachedKey = key;
  return key;
}

export async function encryptForOfflineStorage<T>(data: T): Promise<EncryptedPayload> {
  const key = await getOrCreateDeviceKey();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  return {
    iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(encrypted)),
    version: 1,
  };
}

export async function decryptFromOfflineStorage<T>(payload: EncryptedPayload): Promise<T> {
  const key = await getOrCreateDeviceKey();
  const iv = new Uint8Array(payload.iv);
  const ciphertext = new Uint8Array(payload.ciphertext);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  const json = new TextDecoder().decode(decrypted);
  return JSON.parse(json) as T;
}

import { openDB, type IDBPDatabase } from 'idb';
import { decryptFromOfflineStorage, encryptForOfflineStorage } from './offlineCrypto.ts';
import type {
  OfflineDraft,
  QuestionnaireVersion,
  Site,
  StudyConfig,
  SyncQueueItem,
} from '../types/study.ts';

const OFFLINE_DB_NAME = 'data-scavengers-offline-v1';

interface StoredRecord {
  id: string;
  updatedAt: string;
  encrypted: {
    iv: number[];
    ciphertext: number[];
    version: 1;
  };
}

interface MetaRecord {
  key: string;
  value: unknown;
  updatedAt: string;
}

async function getOfflineDB(): Promise<IDBPDatabase> {
  return openDB(OFFLINE_DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    },
  });
}

export async function saveOfflineDraft(draft: OfflineDraft): Promise<void> {
  const db = await getOfflineDB();
  const encrypted = await encryptForOfflineStorage(draft);
  const record: StoredRecord = {
    id: draft.id,
    updatedAt: draft.updatedAt,
    encrypted,
  };
  await db.put('drafts', record);
}

export async function listOfflineDrafts(interviewerUid?: string): Promise<OfflineDraft[]> {
  const db = await getOfflineDB();
  const records = (await db.getAll('drafts')) as StoredRecord[];
  const results: OfflineDraft[] = [];
  for (const rec of records) {
    try {
      const draft = await decryptFromOfflineStorage<OfflineDraft>(rec.encrypted);
      if (!interviewerUid || draft.interviewerUid === interviewerUid) {
        results.push(draft);
      }
    } catch {
      // Skip unreadable record if device key rotated
    }
  }
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteOfflineDraft(id: string): Promise<void> {
  const db = await getOfflineDB();
  await db.delete('drafts', id);
}

export async function enqueueSyncItem(item: SyncQueueItem): Promise<void> {
  const db = await getOfflineDB();
  const encrypted = await encryptForOfflineStorage(item);
  const record: StoredRecord = {
    id: item.id,
    updatedAt: item.queuedAt,
    encrypted,
  };
  await db.put('syncQueue', record);
}

export async function listSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getOfflineDB();
  const records = (await db.getAll('syncQueue')) as StoredRecord[];
  const items: SyncQueueItem[] = [];
  for (const rec of records) {
    try {
      const item = await decryptFromOfflineStorage<SyncQueueItem>(rec.encrypted);
      items.push(item);
    } catch {
      // Skip corrupted/unreadable record
    }
  }
  return items.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const db = await getOfflineDB();
  await db.delete('syncQueue', id);
}

export async function saveCachedStudyBundle(bundle: {
  sites: Site[];
  questionnaire: QuestionnaireVersion;
  config: StudyConfig;
}): Promise<void> {
  const db = await getOfflineDB();
  const now = new Date().toISOString();
  await db.put('meta', { key: 'sites', value: bundle.sites, updatedAt: now } as MetaRecord);
  await db.put('meta', { key: 'questionnaire', value: bundle.questionnaire, updatedAt: now } as MetaRecord);
  await db.put('meta', { key: 'config', value: bundle.config, updatedAt: now } as MetaRecord);
}

export async function loadCachedStudyBundle(): Promise<{
  sites?: Site[];
  questionnaire?: QuestionnaireVersion;
  config?: StudyConfig;
}> {
  const db = await getOfflineDB();
  const sitesRec = (await db.get('meta', 'sites')) as MetaRecord | undefined;
  const qRec = (await db.get('meta', 'questionnaire')) as MetaRecord | undefined;
  const cfgRec = (await db.get('meta', 'config')) as MetaRecord | undefined;
  return {
    sites: sitesRec?.value as Site[] | undefined,
    questionnaire: qRec?.value as QuestionnaireVersion | undefined,
    config: cfgRec?.value as StudyConfig | undefined,
  };
}

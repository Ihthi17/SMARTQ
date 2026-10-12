import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { Setting } from './setting.model.js';

const BACKUP_DIRECTORY = resolve(dirname(fileURLToPath(import.meta.url)), '../../../backups');
const BACKUP_FILE_PATTERN = /^smartqueue-\d{8}T\d{9}Z\.json$/;
const MAX_RESTORE_DOCUMENTS = 100_000;

const serialize = (value) => {
  if (value instanceof mongoose.Types.ObjectId) return { $$smartqueueType: 'ObjectId', value: value.toString() };
  if (value instanceof Date) return { $$smartqueueType: 'Date', value: value.toISOString() };
  if (Buffer.isBuffer(value)) return { $$smartqueueType: 'Buffer', value: value.toString('base64') };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serialize(entry)]));
  }
  return value;
};

const deserialize = (value) => {
  if (Array.isArray(value)) return value.map(deserialize);
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 2 && value.$$smartqueueType === 'ObjectId') {
      if (!mongoose.isValidObjectId(value.value)) throw new Error('Backup contains an invalid ObjectId.');
      return new mongoose.Types.ObjectId(value.value);
    }
    if (Object.keys(value).length === 2 && value.$$smartqueueType === 'Date') {
      const date = new Date(value.value);
      if (Number.isNaN(date.getTime())) throw new Error('Backup contains an invalid date.');
      return date;
    }
    if (Object.keys(value).length === 2 && value.$$smartqueueType === 'Buffer') {
      return Buffer.from(value.value, 'base64');
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, deserialize(entry)]));
  }
  return value;
};

const getBackupNames = async () => {
  await mkdir(BACKUP_DIRECTORY, { recursive: true });
  const files = await readdir(BACKUP_DIRECTORY);
  const backups = await Promise.all(files
    .filter((name) => BACKUP_FILE_PATTERN.test(name))
    .map(async (name) => {
      const metadata = await stat(join(BACKUP_DIRECTORY, name));
      return { name, size: metadata.size, createdAt: metadata.mtime.toISOString() };
    }));
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const createDatabaseBackup = async () => {
  if (mongoose.connection.readyState !== 1) throw new Error('Database is not connected.');
  await mkdir(BACKUP_DIRECTORY, { recursive: true });
  const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  const snapshotCollections = {};

  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    const documents = await mongoose.connection.db.collection(name).find({}).toArray();
    snapshotCollections[name] = documents.map(serialize);
  }

  const snapshot = {
    format: 'smartqueue-database-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    databaseName: mongoose.connection.name,
    collections: snapshotCollections,
  };
  const fileName = `smartqueue-${new Date().toISOString().replace(/[-:.]/g, '')}.json`;
  const filePath = join(BACKUP_DIRECTORY, fileName);
  await writeFile(filePath, JSON.stringify(snapshot), { flag: 'wx' });
  await pruneBackups();
  const metadata = await stat(filePath);
  return { name: fileName, size: metadata.size, createdAt: metadata.mtime.toISOString() };
};

export const listDatabaseBackups = getBackupNames;

export const getDatabaseBackupPath = (name) => {
  if (!BACKUP_FILE_PATTERN.test(name)) throw new Error('Invalid backup name.');
  return join(BACKUP_DIRECTORY, name);
};

export const restoreDatabaseBackup = async (backup) => {
  if (!backup || backup.format !== 'smartqueue-database-backup' || backup.version !== 1 ||
      !backup.collections || typeof backup.collections !== 'object' || Array.isArray(backup.collections)) {
    throw Object.assign(new Error('Unsupported or invalid backup file.'), { statusCode: 400 });
  }

  const collectionEntries = Object.entries(backup.collections);
  const documentCount = collectionEntries.reduce((total, [, documents]) =>
    total + (Array.isArray(documents) ? documents.length : MAX_RESTORE_DOCUMENTS + 1), 0);
  if (documentCount > MAX_RESTORE_DOCUMENTS) {
    throw Object.assign(new Error('Backup exceeds the restore limit.'), { statusCode: 400 });
  }
  for (const [name, documents] of collectionEntries) {
    if (!/^[a-zA-Z0-9_-]+$/.test(name) || name.startsWith('system.') || !Array.isArray(documents)) {
      throw Object.assign(new Error('Backup contains an invalid collection.'), { statusCode: 400 });
    }
  }

  let restoredCollections;
  try {
    restoredCollections = collectionEntries.map(([name, docs]) => [name, docs.map(deserialize)]);
  } catch (error) {
    throw Object.assign(error, { statusCode: 400 });
  }
  const existing = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  const existingNames = new Set(existing.map(({ name }) => name).filter((name) => !name.startsWith('system.')));
  for (const name of existingNames) {
    if (!backup.collections[name]) {
      backup.collections[name] = [];
    }
  }

  for (const [name, documents] of restoredCollections) {
    if (!existingNames.has(name)) await mongoose.connection.db.createCollection(name);
    const collection = mongoose.connection.db.collection(name);
    await collection.deleteMany({});
    if (documents.length) await collection.insertMany(documents, { ordered: true });
  }
  for (const name of existingNames) {
    if (!backup.collections[name]) await mongoose.connection.db.collection(name).deleteMany({});
  }

  return { collections: restoredCollections.length, documents: documentCount };
};

export const pruneBackups = async () => {
  const retentionCount = Math.max(1, Number(await Setting.get('backup_retention_count', 7)) || 7);
  const backups = await getBackupNames();
  for (const backup of backups.slice(retentionCount)) {
    await rm(join(BACKUP_DIRECTORY, backup.name));
  }
};

let scheduler;
let backupInProgress = false;

export const startAutomaticBackupScheduler = () => {
  if (scheduler) return scheduler;
  scheduler = setInterval(async () => {
    if (backupInProgress) return;
    try {
      const enabled = await Setting.get('backup_enabled', false);
      if (!enabled) return;
      const intervalHours = Math.max(1, Number(await Setting.get('backup_interval_hours', 24)) || 24);
      const [latest] = await getBackupNames();
      if (latest && Date.now() - new Date(latest.createdAt).getTime() < intervalHours * 60 * 60 * 1000) return;
      backupInProgress = true;
      const created = await createDatabaseBackup();
      console.log(`Automatic database backup created: ${created.name}`);
    } catch (error) {
      console.error('Automatic database backup failed:', error);
    } finally {
      backupInProgress = false;
    }
  }, 60 * 1000);
  scheduler.unref();
  return scheduler;
};

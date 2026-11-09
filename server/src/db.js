import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config, mergeSettings } from './config.js';
import { encrypt, decrypt, randomKey } from './crypto.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
const db = new DatabaseSync(config.dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS stores (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    public_key       TEXT NOT NULL UNIQUE,
    name             TEXT NOT NULL,
    ikas_store_name  TEXT NOT NULL,
    client_id        TEXT NOT NULL,
    client_secret    TEXT NOT NULL,
    merchant_id      TEXT,
    settings         TEXT NOT NULL DEFAULT '{}',
    last_sync_at     INTEGER,
    last_sync_status TEXT,
    last_sync_message TEXT,
    last_sync_stats  TEXT,
    created_at       INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS category_tops (
    store_id      INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    category_id   TEXT NOT NULL,
    category_slug TEXT NOT NULL,
    category_name TEXT NOT NULL,
    items         TEXT NOT NULL,
    updated_at    INTEGER NOT NULL,
    PRIMARY KEY (store_id, category_id)
  );
  CREATE INDEX IF NOT EXISTS idx_tops_slug ON category_tops(store_id, category_slug);
`);

// Geçiş: eski varsayılan başlığı değiştirilmemiş mağazaları yeni varsayılana al
for (const row of db.prepare('SELECT id, settings FROM stores').all()) {
  const s = JSON.parse(row.settings || '{}');
  if (s.title === 'Öne Çıkan Ürünler') {
    s.title = 'Öne Çıkanlar';
    db.prepare('UPDATE stores SET settings = ? WHERE id = ?').run(JSON.stringify(s), row.id);
  }
}

function rowToStore(row, { withSecret = false } = {}) {
  if (!row) return null;
  const store = {
    id: row.id,
    publicKey: row.public_key,
    name: row.name,
    ikasStoreName: row.ikas_store_name,
    clientId: row.client_id,
    merchantId: row.merchant_id,
    settings: mergeSettings(JSON.parse(row.settings || '{}')),
    lastSyncAt: row.last_sync_at,
    lastSyncStatus: row.last_sync_status,
    lastSyncMessage: row.last_sync_message,
    lastSyncStats: row.last_sync_stats ? JSON.parse(row.last_sync_stats) : null,
    createdAt: row.created_at,
  };
  if (withSecret) store.clientSecret = decrypt(row.client_secret);
  return store;
}

export const Stores = {
  list() {
    return db.prepare('SELECT * FROM stores ORDER BY name').all().map((r) => rowToStore(r));
  },
  get(id, opts) {
    return rowToStore(db.prepare('SELECT * FROM stores WHERE id = ?').get(id), opts);
  },
  getByKey(publicKey) {
    return rowToStore(db.prepare('SELECT * FROM stores WHERE public_key = ?').get(publicKey));
  },
  create({ name, ikasStoreName, clientId, clientSecret, settings }) {
    const res = db
      .prepare(
        `INSERT INTO stores (public_key, name, ikas_store_name, client_id, client_secret, settings, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(randomKey('ms'), name, ikasStoreName, clientId, encrypt(clientSecret), JSON.stringify(mergeSettings(settings)), Date.now());
    return this.get(Number(res.lastInsertRowid));
  },
  update(id, { name, ikasStoreName, clientId, clientSecret, settings }) {
    const cur = this.get(id);
    if (!cur) return null;
    db.prepare(
      `UPDATE stores SET name = ?, ikas_store_name = ?, client_id = ?, settings = ? WHERE id = ?`
    ).run(
      name ?? cur.name,
      ikasStoreName ?? cur.ikasStoreName,
      clientId ?? cur.clientId,
      JSON.stringify(mergeSettings({ ...cur.settings, ...(settings || {}) })),
      id
    );
    if (clientSecret) db.prepare('UPDATE stores SET client_secret = ? WHERE id = ?').run(encrypt(clientSecret), id);
    return this.get(id);
  },
  remove(id) {
    db.prepare('DELETE FROM stores WHERE id = ?').run(id);
  },
  setMerchantId(id, merchantId) {
    db.prepare('UPDATE stores SET merchant_id = ? WHERE id = ?').run(merchantId, id);
  },
  setSyncResult(id, { status, message, stats }) {
    db.prepare(
      `UPDATE stores SET last_sync_at = ?, last_sync_status = ?, last_sync_message = ?, last_sync_stats = ? WHERE id = ?`
    ).run(Date.now(), status, message || null, stats ? JSON.stringify(stats) : null, id);
  },
};

export const Tops = {
  /** Bir mağazanın tüm kategori sonuçlarını tek işlemde değiştirir. */
  replaceAll(storeId, categories) {
    const now = Date.now();
    const insert = db.prepare(
      `INSERT INTO category_tops (store_id, category_id, category_slug, category_name, items, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM category_tops WHERE store_id = ?').run(storeId);
      for (const c of categories) {
        insert.run(storeId, c.id, c.slug, c.name, JSON.stringify(c.items), now);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  },
  list(storeId) {
    return db
      .prepare('SELECT * FROM category_tops WHERE store_id = ? ORDER BY category_name')
      .all(storeId)
      .map((r) => ({
        categoryId: r.category_id,
        slug: r.category_slug,
        name: r.category_name,
        items: JSON.parse(r.items),
        updatedAt: r.updated_at,
      }));
  },
  slugs(storeId) {
    return db.prepare('SELECT category_slug FROM category_tops WHERE store_id = ?').all(storeId).map((r) => r.category_slug);
  },
  getBySlug(storeId, slug) {
    const r = db.prepare('SELECT * FROM category_tops WHERE store_id = ? AND category_slug = ?').get(storeId, slug);
    return r ? { name: r.category_name, items: JSON.parse(r.items), updatedAt: r.updated_at } : null;
  },
};

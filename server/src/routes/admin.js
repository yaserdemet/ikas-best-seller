import { Router } from 'express';
import { config, DEFAULT_SETTINGS } from '../config.js';
import { signSession, verifySession, safeEqual } from '../crypto.js';
import { Stores, Tops } from '../db.js';
import { syncStore, isSyncing, clientFor, forgetClient } from '../sync.js';

const r = Router();

// ---- Giriş ----
const loginAttempts = new Map(); // ip -> { count, until }
r.post('/login', (req, res) => {
  const ip = req.ip;
  const a = loginAttempts.get(ip);
  if (a && a.until > Date.now()) return res.status(429).json({ error: 'Çok fazla deneme. Birkaç dakika sonra tekrar deneyin.' });
  if (!safeEqual(req.body?.password || '', config.adminPassword)) {
    const next = { count: (a?.count || 0) + 1, until: 0 };
    if (next.count >= 5) next.until = Date.now() + 5 * 60 * 1000;
    loginAttempts.set(ip, next);
    return res.status(401).json({ error: 'Şifre hatalı' });
  }
  loginAttempts.delete(ip);
  res.json({ token: signSession() });
});

// ---- Bundan sonrası oturum ister ----
r.use((req, res, next) => {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!verifySession(token)) return res.status(401).json({ error: 'Oturum geçersiz' });
  next();
});

const withStatus = (s) => s && { ...s, syncing: isSyncing(s.id) };

function validateStoreInput(body, { partial = false } = {}) {
  const errors = [];
  const need = ['name', 'ikasStoreName', 'clientId', 'clientSecret'];
  if (!partial) for (const k of need) if (!body?.[k] || !String(body[k]).trim()) errors.push(`${k} zorunlu`);
  if (body?.ikasStoreName && !/^[a-z0-9-]+(\.myikas\.com)?$/i.test(String(body.ikasStoreName).trim())) {
    errors.push('ikasStoreName yalnızca mağaza adı olmalı (örn. "nothingbag")');
  }
  return errors;
}

function cleanSettings(input = {}) {
  const out = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in input)) continue;
    const def = DEFAULT_SETTINGS[key];
    let v = input[key];
    if (typeof def === 'number') v = Number(v);
    else if (typeof def === 'boolean') v = Boolean(v);
    else if (Array.isArray(def)) v = (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
    else v = String(v ?? '');
    if (typeof def === 'number' && !Number.isFinite(v)) continue;
    out[key] = v;
  }
  if ('periodDays' in out) out.periodDays = Math.min(365, Math.max(1, Math.round(out.periodDays)));
  if ('limit' in out) out.limit = Math.min(48, Math.max(1, Math.round(out.limit)));
  if ('minItems' in out) out.minItems = Math.min(48, Math.max(1, Math.round(out.minItems)));
  if ('syncIntervalHours' in out) out.syncIntervalHours = Math.min(168, Math.max(1, out.syncIntervalHours));
  if ('metric' in out && !['quantity', 'revenue'].includes(out.metric)) delete out.metric;
  if ('position' in out && !['beforebegin', 'afterbegin', 'beforeend', 'afterend'].includes(out.position)) delete out.position;
  if ('accentColor' in out && !/^#[0-9a-f]{3,8}$/i.test(out.accentColor)) delete out.accentColor;
  if ('imageRatio' in out && !/^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(out.imageRatio)) delete out.imageRatio;
  return out;
}

r.get('/meta', (req, res) => res.json({ publicUrl: config.publicUrl, defaults: DEFAULT_SETTINGS }));

r.get('/stores', (req, res) => res.json(Stores.list().map(withStatus)));

r.post('/stores', (req, res) => {
  const errors = validateStoreInput(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });
  const b = req.body;
  const store = Stores.create({
    name: b.name.trim(),
    ikasStoreName: b.ikasStoreName.trim().toLowerCase().replace(/\.myikas\.com$/, ''),
    clientId: b.clientId.trim(),
    clientSecret: b.clientSecret.trim(),
    settings: cleanSettings(b.settings),
  });
  res.status(201).json(withStatus(store));
});

r.get('/stores/:id', (req, res) => {
  const s = Stores.get(Number(req.params.id));
  if (!s) return res.status(404).json({ error: 'Mağaza bulunamadı' });
  res.json(withStatus(s));
});

r.put('/stores/:id', (req, res) => {
  const id = Number(req.params.id);
  const errors = validateStoreInput(req.body, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join(', ') });
  const b = req.body || {};
  const s = Stores.update(id, {
    name: b.name?.trim() || undefined,
    ikasStoreName: b.ikasStoreName?.trim().toLowerCase().replace(/\.myikas\.com$/, '') || undefined,
    clientId: b.clientId?.trim() || undefined,
    clientSecret: b.clientSecret?.trim() || undefined,
    settings: cleanSettings(b.settings),
  });
  if (!s) return res.status(404).json({ error: 'Mağaza bulunamadı' });
  forgetClient(id);
  res.json(withStatus(s));
});

r.delete('/stores/:id', (req, res) => {
  Stores.remove(Number(req.params.id));
  forgetClient(Number(req.params.id));
  res.json({ ok: true });
});

/** Bağlantı testi: token + kategori listesi + son 1 günün sipariş sayısı. */
r.post('/stores/:id/test', async (req, res) => {
  const store = Stores.get(Number(req.params.id), { withSecret: true });
  if (!store) return res.status(404).json({ error: 'Mağaza bulunamadı' });
  forgetClient(store.id);
  const client = clientFor(store);
  try {
    await client.getToken();
    const cats = await client.listCategories();
    let orders = null;
    for await (const p of client.iterateOrders(Date.now() - 7 * 864e5, 1)) {
      orders = p.count;
      break;
    }
    res.json({ ok: true, categories: cats.length, ordersLast7Days: orders });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** Senkronu başlatır; bitmesini beklemez. Durum GET /stores/:id ile izlenir. */
r.post('/stores/:id/sync', (req, res) => {
  const id = Number(req.params.id);
  if (!Stores.get(id)) return res.status(404).json({ error: 'Mağaza bulunamadı' });
  if (isSyncing(id)) return res.status(409).json({ error: 'Senkron zaten çalışıyor' });
  syncStore(id, { log: (...a) => console.log(`[sync #${id}]`, ...a) }).catch((e) =>
    console.error(`[sync #${id}] hata:`, e.message)
  );
  res.status(202).json({ started: true });
});

r.get('/stores/:id/categories', (req, res) => {
  res.json(Tops.list(Number(req.params.id)));
});

export default r;

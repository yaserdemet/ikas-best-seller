import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import adminRoutes from './routes/admin.js';
import publicRoutes from './routes/public.js';
import { startScheduler } from './scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '200kb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

// Vitrin widget'ı
app.get('/widget.js', (req, res) => {
  res.set('Content-Type', 'application/javascript; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=600');
  res.set('Access-Control-Allow-Origin', '*');
  res.sendFile(path.join(__dirname, '..', 'public', 'widget.js'));
});

app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);

// Yönetim paneli (admin/ klasörü build edildiyse)
const adminDist = path.join(__dirname, '..', '..', 'admin', 'dist');
if (fs.existsSync(adminDist)) {
  app.use(express.static(adminDist));
  app.get(/^\/(?!api\/|widget\.js).*/, (req, res) => res.sendFile(path.join(adminDist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Sunucu hatası' });
});

app.listen(config.port, () => {
  console.log(`most-seller ${config.port} portunda çalışıyor → ${config.publicUrl}`);
  startScheduler();
});

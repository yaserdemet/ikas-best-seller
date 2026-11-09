import { config } from './config.js';
import { Stores } from './db.js';
import { syncStore, isSyncing } from './sync.js';

let busy = false;

/** Senkron zamanı gelmiş mağazaları sırayla (aynı anda tek mağaza) işler. */
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();
    const due = Stores.list().filter((s) => {
      if (!s.settings.enabled || isSyncing(s.id)) return false;
      if (!s.lastSyncAt) return true;
      // Hata alan mağazayı 1 saatte bir yeniden dene
      const interval = s.lastSyncStatus === 'error' ? 1 : s.settings.syncIntervalHours;
      return now - s.lastSyncAt >= interval * 3600 * 1000;
    });
    for (const s of due) {
      try {
        await syncStore(s.id, { log: (...a) => console.log(`[sync #${s.id} ${s.name}]`, ...a) });
      } catch (e) {
        console.error(`[sync #${s.id} ${s.name}] hata:`, e.message);
      }
    }
  } finally {
    busy = false;
  }
}

export function startScheduler() {
  setTimeout(tick, 5000);
  setInterval(tick, config.schedulerTickMinutes * 60 * 1000);
}

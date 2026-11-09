import 'dotenv/config';
import path from 'node:path';

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] ${name} ortam değişkeni tanımlı değil. .env.example dosyasına bakın.`);
    process.exit(1);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT || 4000),
  adminPassword: required('ADMIN_PASSWORD'),
  appSecret: required('APP_SECRET'),
  dbPath: path.resolve(process.env.DB_PATH || './data/most-seller.db'),
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/+$/, ''),
  schedulerTickMinutes: Number(process.env.SCHEDULER_TICK_MINUTES || 10),
};

/** Yeni mağaza eklenirken kullanılan varsayılan ayarlar. */
export const DEFAULT_SETTINGS = {
  enabled: true,
  // Hesaplama
  periodDays: 14,              // son kaç günün siparişleri
  metric: 'quantity',          // 'quantity' (adet) | 'revenue' (ciro)
  limit: 12,                   // kategori başına en fazla ürün
  minItems: 4,                 // bundan az ürün varsa bölüm gösterilmez
  hideOutOfStock: true,
  includeSubcategories: true,  // alt kategorideki satışlar üst kategoriye de sayılır
  syncIntervalHours: 6,
  excludedCategorySlugs: [],   // bölümün gösterilmeyeceği kategoriler
  // Görünüm
  title: 'Öne Çıkan Ürünler',
  selectorDesktop: '',         // boşsa: #ms-bestsellers > main
  selectorMobile: '',          // boşsa masaüstü seçici kullanılır
  position: 'beforebegin',     // beforebegin | afterbegin | beforeend | afterend
  accentColor: '#111111',
  cardRadius: 8,
  imageRatio: '3/4',
  showBadge: true,             // kartta "Çok Satan" rozeti
  customCss: '',
};

export function mergeSettings(saved) {
  return { ...DEFAULT_SETTINGS, ...(saved || {}) };
}

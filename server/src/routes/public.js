import { Router } from 'express';
import cors from 'cors';
import { Stores, Tops } from '../db.js';

/**
 * Mağaza vitrinindeki widget'ın çağırdığı herkese açık uçlar.
 * Satış adedi / ciro gibi hassas bilgiler DIŞARI VERİLMEZ, sadece kart verisi döner.
 */
const r = Router();
r.use(cors({ origin: '*', methods: ['GET'] }));

const publicSettings = (s) => ({
  title: s.title,
  minItems: s.minItems,
  selectorDesktop: s.selectorDesktop,
  selectorMobile: s.selectorMobile,
  position: s.position,
  accentColor: s.accentColor,
  cardRadius: s.cardRadius,
  imageRatio: s.imageRatio,
  showBadge: s.showBadge,
  customCss: s.customCss,
});

const publicItem = (i) => ({
  id: i.id,
  name: i.name,
  url: i.url,
  image: i.image,
  hoverImage: i.hoverImage,
  price: i.price,
  compareAtPrice: i.compareAtPrice,
  currency: i.currency,
  currencySymbol: i.currencySymbol,
});

/** Widget ilk yüklemede bunu alır: ayarlar + gösterilecek kategori slug'ları. */
r.get('/:key/bootstrap', (req, res) => {
  const store = Stores.getByKey(req.params.key);
  if (!store || !store.settings.enabled) return res.status(404).json({ enabled: false });
  const min = store.settings.minItems;
  const slugs = Tops.list(store.id)
    .filter((c) => c.items.length >= min)
    .map((c) => c.slug);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ enabled: true, settings: publicSettings(store.settings), slugs });
});

r.get('/:key/category/:slug', (req, res) => {
  const store = Stores.getByKey(req.params.key);
  if (!store || !store.settings.enabled) return res.status(404).json({ items: [] });
  const slug = String(req.params.slug).toLowerCase();
  const top = Tops.getBySlug(store.id, slug);
  res.set('Cache-Control', 'public, max-age=300');
  if (!top || top.items.length < store.settings.minItems) return res.json({ items: [] });
  res.json({ category: top.name, title: store.settings.title, items: top.items.map(publicItem) });
});

export default r;

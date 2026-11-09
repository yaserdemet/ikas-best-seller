import { IkasClient } from './ikas.js';
import { Stores, Tops } from './db.js';

/** Sayılmayacak sipariş durumları (OrderStatusEnum). */
const EXCLUDED_ORDER_STATUSES = new Set(['CANCELLED', 'REFUNDED', 'DRAFT', 'WAITING_UPSELL_ACTION']);
/** Sayılmayacak satır durumları (iptal / iade edilmiş satırlar). */
const isExcludedLineStatus = (s) => !!s && /CANCEL|^REFUNDED$/.test(s);

const running = new Set();
const clients = new Map(); // storeId -> IkasClient (token önbelleği için)

export function isSyncing(storeId) {
  return running.has(storeId);
}

export function clientFor(store) {
  const cached = clients.get(store.id);
  if (
    cached &&
    cached.clientId === store.clientId &&
    cached.clientSecret === store.clientSecret &&
    cached.storeName === store.ikasStoreName
  ) {
    return cached;
  }
  const c = new IkasClient({ storeName: store.ikasStoreName, clientId: store.clientId, clientSecret: store.clientSecret });
  clients.set(store.id, c);
  return c;
}

export function forgetClient(storeId) {
  clients.delete(storeId);
}

function imageUrl(merchantId, imageId, size = 720) {
  if (!merchantId || !imageId) return null;
  return `https://cdn.myikas.com/images/${merchantId}/${imageId}/image_${size}.webp`;
}

/** Ürünü vitrine uygun kart verisine çevirir. */
function toCard(product, merchantId) {
  const variants = (product.variants || []).filter((v) => v.isActive !== false);
  if (!variants.length) return null;

  // Ana görseli olan ilk aktif varyant
  const withImage = variants.find((v) => v.images?.some((i) => !i.isVideo && i.imageId)) || variants[0];
  const images = (withImage.images || []).filter((i) => !i.isVideo && i.imageId).sort((a, b) => a.order - b.order);
  const main = images.find((i) => i.isMain) || images[0];
  const hover = images.find((i) => i !== main);

  // Varsayılan fiyat listesi (priceListId boş olan)
  const price = (withImage.prices || []).find((p) => !p.priceListId) || withImage.prices?.[0];
  if (!price) return null;

  const slug = product.metaData?.slug;
  if (!slug) return null;

  const hasDiscount = price.discountPrice != null && price.discountPrice > 0 && price.discountPrice < price.sellPrice;
  return {
    id: product.id,
    name: product.name,
    url: `/${slug}`,
    image: imageUrl(merchantId, main?.imageId),
    hoverImage: imageUrl(merchantId, hover?.imageId),
    price: hasDiscount ? price.discountPrice : price.sellPrice,
    compareAtPrice: hasDiscount ? price.sellPrice : null,
    currency: price.currencyCode || 'TRY',
    currencySymbol: price.currencySymbol || '₺',
  };
}

function isInStock(product) {
  if (product.totalStock == null) return true; // stok takibi yok
  if (product.totalStock > 0) return true;
  return (product.variants || []).some((v) => v.isActive !== false && v.sellIfOutOfStock);
}

/**
 * Bir mağazanın siparişlerini çekip kategori bazında en çok satanları hesaplar ve kaydeder.
 * @returns {Promise<object>} istatistikler
 */
export async function syncStore(storeId, { log = () => {} } = {}) {
  if (running.has(storeId)) throw new Error('Bu mağaza için senkron zaten çalışıyor.');
  running.add(storeId);
  const startedAt = Date.now();
  try {
    const store = Stores.get(storeId, { withSecret: true });
    if (!store) throw new Error('Mağaza bulunamadı');
    const s = store.settings;
    const client = clientFor(store);

    // 1) Kategoriler
    const categories = await client.listCategories();
    const catById = new Map(categories.map((c) => [c.id, c]));
    log(`${categories.length} kategori`);

    // 2) Siparişler → ürün bazında toplama (beden/renk varyantları tek üründe birleşir)
    const since = Date.now() - s.periodDays * 24 * 3600 * 1000;
    const agg = new Map(); // productId -> { quantity, revenue, orders }
    let merchantId = store.merchantId;
    let orderCount = 0;
    for await (const { orders, page, count } of client.iterateOrders(since)) {
      log(`sipariş sayfası ${page} (${count} sipariş)`);
      for (const o of orders) {
        if (!merchantId && o.merchantId) merchantId = o.merchantId;
        if (EXCLUDED_ORDER_STATUSES.has(o.status)) continue;
        orderCount++;
        const seenInOrder = new Set();
        for (const li of o.orderLineItems || []) {
          if (isExcludedLineStatus(li.status)) continue;
          const pid = li.variant?.productId;
          if (!pid) continue;
          const qty = Number(li.quantity) || 0;
          const revenue = li.finalPrice != null ? Number(li.finalPrice) : Number(li.finalUnitPrice || 0) * qty;
          const a = agg.get(pid) || { quantity: 0, revenue: 0, orders: 0 };
          a.quantity += qty;
          a.revenue += revenue;
          if (!seenInOrder.has(pid)) {
            a.orders += 1;
            seenInOrder.add(pid);
          }
          agg.set(pid, a);
        }
      }
    }
    if (merchantId && merchantId !== store.merchantId) Stores.setMerchantId(store.id, merchantId);

    // 3) Ürün detayları (güncel kategori, fiyat, görsel, stok)
    const products = await client.getProducts([...agg.keys()]);
    log(`${products.length} ürün detayı`);

    // 4) Kategori bazında gruplama
    const ancestorsOf = (catId) => {
      const out = [];
      let cur = catById.get(catId);
      const guard = new Set();
      while (cur?.parentId && !guard.has(cur.parentId)) {
        guard.add(cur.parentId);
        out.push(cur.parentId);
        cur = catById.get(cur.parentId);
      }
      return out;
    };

    const metricKey = s.metric === 'revenue' ? 'revenue' : 'quantity';
    const byCategory = new Map(); // catId -> [{card, stats}]
    let skippedStock = 0;
    for (const p of products) {
      if (s.hideOutOfStock && !isInStock(p)) {
        skippedStock++;
        continue;
      }
      const card = toCard(p, merchantId);
      if (!card) continue;
      const stats = agg.get(p.id);
      const catIds = new Set(p.categoryIds || []);
      if (s.includeSubcategories) for (const id of [...catIds]) ancestorsOf(id).forEach((a) => catIds.add(a));
      for (const cid of catIds) {
        if (!catById.has(cid)) continue;
        if (!byCategory.has(cid)) byCategory.set(cid, []);
        byCategory.get(cid).push({ ...card, quantity: stats.quantity, revenue: Math.round(stats.revenue * 100) / 100, orders: stats.orders });
      }
    }

    const excluded = new Set((s.excludedCategorySlugs || []).map((x) => String(x).toLowerCase()));
    const results = [];
    for (const [cid, list] of byCategory) {
      const cat = catById.get(cid);
      const slug = cat.metaData?.slug?.toLowerCase();
      if (!slug || excluded.has(slug)) continue;
      list.sort((a, b) => b[metricKey] - a[metricKey] || b.orders - a.orders);
      results.push({ id: cid, slug, name: cat.name, items: list.slice(0, s.limit) });
    }
    Tops.replaceAll(store.id, results);

    const stats = {
      durationMs: Date.now() - startedAt,
      periodDays: s.periodDays,
      orders: orderCount,
      productsSold: agg.size,
      skippedOutOfStock: skippedStock,
      categories: results.length,
      categoriesShown: results.filter((r) => r.items.length >= s.minItems).length,
    };
    Stores.setSyncResult(store.id, { status: 'ok', message: null, stats });
    log('tamamlandı', stats);
    return stats;
  } catch (e) {
    Stores.setSyncResult(storeId, { status: 'error', message: e.message });
    throw e;
  } finally {
    running.delete(storeId);
  }
}

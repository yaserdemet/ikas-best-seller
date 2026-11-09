/**
 * ikas Admin API (v1, GraphQL) istemcisi.
 * Yetkilendirme: Özel Uygulama (private app) → client_credentials OAuth.
 * Docs: https://ikas.dev/docs/api/getting-started/authentication
 */
const GRAPHQL_URL = 'https://api.myikas.com/api/v1/admin/graphql';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class IkasError extends Error {}

export class IkasClient {
  /** @param {{ storeName: string, clientId: string, clientSecret: string }} opts */
  constructor({ storeName, clientId, clientSecret }) {
    this.storeName = String(storeName).trim().replace(/\.myikas\.com.*$/i, '').replace(/^https?:\/\//i, '');
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async getToken() {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const res = await fetch(`https://${this.storeName}.myikas.com/api/admin/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new IkasError(`ikas token alınamadı (HTTP ${res.status}). Mağaza adı, Client ID ve Client Secret'ı kontrol edin.`);
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new IkasError('ikas token yanıtı okunamadı. Mağaza adı doğru mu? (örn. "nothingbag")');
    }
    this.token = json.access_token;
    // expires_in = 14400 (saniye). 2 dakika pay bırak.
    this.tokenExpiresAt = Date.now() + Math.max(60, Number(json.expires_in || 3600) - 120) * 1000;
    return this.token;
  }

  async query(query, variables = {}, attempt = 1) {
    const token = await this.getToken();
    let res;
    try {
      res = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ query, variables }),
      });
    } catch (e) {
      if (attempt < 4) {
        await sleep(1000 * attempt);
        return this.query(query, variables, attempt + 1);
      }
      throw new IkasError(`ikas API'ye ulaşılamadı: ${e.message}`);
    }

    if (res.status === 401 && attempt === 1) {
      this.token = null;
      return this.query(query, variables, attempt + 1);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt;
      await sleep(retryAfter * 1000);
      return this.query(query, variables, attempt + 1);
    }

    const json = await res.json().catch(() => null);
    if (!res.ok || !json) throw new IkasError(`ikas API hatası (HTTP ${res.status})`);
    if (json.errors?.length) {
      throw new IkasError('ikas API: ' + json.errors.map((e) => e.message).join(' | '));
    }
    return json.data;
  }

  /** Tüm kategoriler (listCategory sayfalama almıyor). */
  async listCategories() {
    const data = await this.query(`
      query {
        listCategory {
          id
          name
          parentId
          metaData { slug }
        }
      }
    `);
    return data.listCategory || [];
  }

  /**
   * Verilen tarihten sonra verilen siparişleri sayfa sayfa döndürür.
   * @param {number} since ms timestamp
   * @param {(page: {orders: any[], page: number, count: number}) => void} [onPage]
   */
  async *iterateOrders(since, limit = 100) {
    let page = 1;
    while (true) {
      const data = await this.query(
        `
        query Orders($since: Timestamp!, $page: Int!, $limit: Int!) {
          listOrder(orderedAt: { gte: $since }, pagination: { page: $page, limit: $limit }) {
            count
            hasNext
            data {
              id
              merchantId
              status
              orderedAt
              orderLineItems {
                quantity
                finalPrice
                finalUnitPrice
                status
                variant { productId }
              }
            }
          }
        }
      `,
        { since, page, limit }
      );
      const res = data.listOrder;
      yield { orders: res.data || [], page, count: res.count };
      if (!res.hasNext || !res.data?.length) break;
      page += 1;
      if (page > 2000) break; // güvenlik sınırı
    }
  }

  /** Ürün detayları (100'lük gruplar halinde). */
  async getProducts(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const data = await this.query(
        `
        query Products($ids: [String!]!, $limit: Int!) {
          listProduct(id: { in: $ids }, pagination: { page: 1, limit: $limit }) {
            data {
              id
              name
              categoryIds
              totalStock
              metaData { slug }
              variants {
                id
                isActive
                sellIfOutOfStock
                images { imageId isMain order isVideo }
                prices { sellPrice discountPrice currencySymbol currencyCode priceListId }
              }
            }
          }
        }
      `,
        { ids: chunk, limit: chunk.length }
      );
      out.push(...(data.listProduct?.data || []));
    }
    return out;
  }
}

import { useState } from 'react';
import { api } from '../api.js';

export default function SettingsForm({ store, onSaved }) {
  const [s, setS] = useState({ ...store.settings, excludedCategorySlugs: store.settings.excludedCategorySlugs.join(', ') });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k, type) => (e) => {
    const v = type === 'bool' ? e.target.checked : e.target.value;
    setS({ ...s, [k]: v });
  };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api(`/stores/${store.id}`, { method: 'PUT', body: { settings: s } });
      setMsg({ type: 'ok', text: 'Kaydedildi. Hesaplama ayarları bir sonraki senkronda uygulanır.' });
      onSaved?.();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Ayarlar</h2>

      <label className="check">
        <input type="checkbox" checked={s.enabled} onChange={set('enabled', 'bool')} />
        <span>Widget açık (kapalıysa sitede bölüm görünmez, senkron da çalışmaz)</span>
      </label>

      <h3>Hesaplama</h3>
      <div className="grid3">
        <label className="field">
          <span>Dönem (gün)</span>
          <input type="number" min="1" max="365" value={s.periodDays} onChange={set('periodDays')} />
        </label>
        <label className="field">
          <span>Sıralama ölçütü</span>
          <select value={s.metric} onChange={set('metric')}>
            <option value="quantity">Satış adedi</option>
            <option value="revenue">Ciro</option>
          </select>
        </label>
        <label className="field">
          <span>Senkron aralığı (saat)</span>
          <input type="number" min="1" max="168" value={s.syncIntervalHours} onChange={set('syncIntervalHours')} />
        </label>
        <label className="field">
          <span>Kategori başına ürün</span>
          <input type="number" min="1" max="48" value={s.limit} onChange={set('limit')} />
        </label>
        <label className="field">
          <span>En az ürün (altındaysa gösterme)</span>
          <input type="number" min="1" max="48" value={s.minItems} onChange={set('minItems')} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={s.hideOutOfStock} onChange={set('hideOutOfStock', 'bool')} />
        <span>Stokta olmayan ürünleri gösterme</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={s.includeSubcategories} onChange={set('includeSubcategories', 'bool')} />
        <span>Alt kategorilerdeki satışları üst kategoriye de say (ör. "Elbise" satışları "Kadın"da da görünür)</span>
      </label>
      <label className="field">
        <span>Gösterilmeyecek kategoriler (slug, virgülle)</span>
        <input value={s.excludedCategorySlugs} onChange={set('excludedCategorySlugs')} placeholder="indirim, yeni-gelenler" />
      </label>

      <h3>Görünüm</h3>
      <div className="grid3">
        <label className="field">
          <span>Başlık</span>
          <input value={s.title} onChange={set('title')} />
        </label>
        <label className="field">
          <span>Vurgu rengi</span>
          <div className="color">
            <input type="color" value={s.accentColor} onChange={set('accentColor')} />
            <input value={s.accentColor} onChange={set('accentColor')} />
          </div>
        </label>
        <label className="field">
          <span>Görsel oranı</span>
          <select value={s.imageRatio} onChange={set('imageRatio')}>
            <option value="3/4">3:4 (dikey)</option>
            <option value="2/3">2:3 (uzun dikey)</option>
            <option value="1/1">1:1 (kare)</option>
            <option value="4/5">4:5</option>
          </select>
        </label>
        <label className="field">
          <span>Köşe yuvarlaklığı (px)</span>
          <input type="number" min="0" max="40" value={s.cardRadius} onChange={set('cardRadius')} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={s.showBadge} onChange={set('showBadge', 'bool')} />
        <span>İlk 3 ürüne "Çok Satan" rozeti koy</span>
      </label>

      <h3>Yerleşim</h3>
      <p className="muted small">
        Bölümün ekleneceği elemanın CSS seçicisi. Boş bırakırsanız sayfada <code>&lt;div id="ms-bestsellers"&gt;</code> varsa
        onun içine, yoksa ikas temasının ürün listesi alanının (<code>.container.category-products-main</code>) başına, o da yoksa <code>&lt;main&gt;</code>'in en üstüne eklenir. Seçiciyi bulmak için kategori sayfasında ürün
        listesine sağ tıklayıp <b>İncele</b> deyin.
      </p>
      <div className="grid3">
        <label className="field">
          <span>Masaüstü seçici</span>
          <input value={s.selectorDesktop} onChange={set('selectorDesktop')} placeholder=".product-list" />
        </label>
        <label className="field">
          <span>Mobil seçici (boşsa masaüstü)</span>
          <input value={s.selectorMobile} onChange={set('selectorMobile')} />
        </label>
        <label className="field">
          <span>Konum</span>
          <select value={s.position} onChange={set('position')}>
            <option value="beforebegin">Elemanın önüne</option>
            <option value="afterend">Elemanın arkasına</option>
            <option value="afterbegin">Elemanın içine (başa)</option>
            <option value="beforeend">Elemanın içine (sona)</option>
          </select>
        </label>
      </div>
      <label className="field">
        <span>Özel CSS (bölümün içinde geçerli: .title, .card, .media, .name, .price, .badge…)</span>
        <textarea rows={4} value={s.customCss} onChange={set('customCss')} placeholder=".title { font-size: 24px; text-transform: uppercase; }" />
      </label>

      {msg && <div className={`alert ${msg.type}`}>{msg.text}</div>}
      <div className="actions">
        <button className="btn primary" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Ayarları kaydet'}
        </button>
      </div>
    </form>
  );
}

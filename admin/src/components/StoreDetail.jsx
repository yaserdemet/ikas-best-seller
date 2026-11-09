import { useEffect, useState } from 'react';
import { api, fmtDate, fmtMoney } from '../api.js';
import StoreForm from './StoreForm.jsx';
import SettingsForm from './SettingsForm.jsx';

const TABS = [
  ['overview', 'Genel'],
  ['results', 'Sonuçlar'],
  ['settings', 'Ayarlar'],
  ['install', 'Kurulum'],
  ['connection', 'Bağlantı'],
];

export default function StoreDetail({ store, meta, onChanged, onDeleted }) {
  const [tab, setTab] = useState('overview');

  // Senkron sürerken durumu yokla
  useEffect(() => {
    if (!store.syncing) return;
    const t = setInterval(onChanged, 3000);
    return () => clearInterval(t);
  }, [store.syncing, onChanged]);

  return (
    <div>
      <header className="detail-head">
        <div>
          <h1>{store.name}</h1>
          <div className="muted small">
            {store.ikasStoreName}.myikas.com · anahtar <code>{store.publicKey}</code>
          </div>
        </div>
      </header>
      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && <Overview store={store} onChanged={onChanged} />}
      {tab === 'results' && <Results store={store} />}
      {tab === 'settings' && <SettingsForm store={store} onSaved={onChanged} />}
      {tab === 'install' && <Install store={store} meta={meta} />}
      {tab === 'connection' && (
        <>
          <StoreForm store={store} onSaved={onChanged} />
          <DangerZone store={store} onDeleted={onDeleted} />
        </>
      )}
    </div>
  );
}

function Overview({ store, onChanged }) {
  const [test, setTest] = useState(null);
  const [busy, setBusy] = useState('');
  const st = store.lastSyncStats;

  async function runTest() {
    setBusy('test');
    setTest(null);
    try {
      setTest(await api(`/stores/${store.id}/test`, { method: 'POST' }));
    } catch (e) {
      setTest({ ok: false, error: e.message });
    } finally {
      setBusy('');
    }
  }

  async function runSync() {
    setBusy('sync');
    try {
      await api(`/stores/${store.id}/sync`, { method: 'POST' });
      await onChanged();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="card">
      <div className="actions left">
        <button className="btn" onClick={runTest} disabled={!!busy}>
          {busy === 'test' ? 'Test ediliyor…' : 'Bağlantıyı test et'}
        </button>
        <button className="btn primary" onClick={runSync} disabled={!!busy || store.syncing}>
          {store.syncing ? 'Senkron sürüyor…' : 'Şimdi senkronize et'}
        </button>
      </div>

      {test &&
        (test.ok ? (
          <div className="alert ok">
            Bağlantı başarılı · {test.categories} kategori · son 7 günde {test.ordersLast7Days ?? '?'} sipariş
          </div>
        ) : (
          <div className="alert error">{test.error}</div>
        ))}

      <div className="stats">
        <Stat label="Son senkron" value={fmtDate(store.lastSyncAt)} />
        <Stat
          label="Durum"
          value={store.syncing ? 'Çalışıyor' : store.lastSyncStatus === 'ok' ? 'Başarılı' : store.lastSyncStatus === 'error' ? 'Hata' : '—'}
        />
        <Stat label="Sipariş" value={st?.orders ?? '—'} hint={st ? `son ${st.periodDays} gün` : ''} />
        <Stat label="Satılan ürün" value={st?.productsSold ?? '—'} />
        <Stat label="Bölüm gösterilen kategori" value={st ? `${st.categoriesShown} / ${st.categories}` : '—'} />
        <Stat label="Süre" value={st ? `${(st.durationMs / 1000).toFixed(1)} sn` : '—'} />
      </div>
      {store.lastSyncStatus === 'error' && <div className="alert error">{store.lastSyncMessage}</div>}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <div className="muted small">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="muted small">{hint}</div>}
    </div>
  );
}

function Results({ store }) {
  const [cats, setCats] = useState(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api(`/stores/${store.id}/categories`).then(setCats).catch(() => setCats([]));
  }, [store.id, store.lastSyncAt]);

  if (!cats) return <div className="card muted">Yükleniyor…</div>;
  if (!cats.length) return <div className="card muted">Henüz sonuç yok. "Genel" sekmesinden senkronu çalıştırın.</div>;

  const min = store.settings.minItems;
  const filtered = cats.filter((c) => (c.name + ' ' + c.slug).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="card">
      <input className="search" placeholder="Kategori ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="cat-list">
        {filtered.map((c) => (
          <div key={c.categoryId} className="cat">
            <button className="cat-head" onClick={() => setOpen(open === c.categoryId ? null : c.categoryId)}>
              <span>
                <b>{c.name}</b> <span className="muted small">/{c.slug}</span>
              </span>
              <span className={`tag ${c.items.length >= min ? 'ok' : ''}`}>
                {c.items.length} ürün {c.items.length < min ? '· gösterilmiyor' : ''}
              </span>
            </button>
            {open === c.categoryId && (
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th></th>
                    <th>Ürün</th>
                    <th className="num">Adet</th>
                    <th className="num">Sipariş</th>
                    <th className="num">Ciro</th>
                  </tr>
                </thead>
                <tbody>
                  {c.items.map((p, i) => (
                    <tr key={p.id}>
                      <td>{i + 1}</td>
                      <td>{p.image && <img className="thumb" src={p.image.replace('image_720', 'image_180')} alt="" />}</td>
                      <td>
                        <a href={`https://${store.ikasStoreName}.myikas.com${p.url}`} target="_blank" rel="noreferrer">
                          {p.name}
                        </a>
                      </td>
                      <td className="num">{p.quantity}</td>
                      <td className="num">{p.orders}</td>
                      <td className="num">{fmtMoney(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Install({ store, meta }) {
  const code = `<script src="${meta.publicUrl}/widget.js" data-store="${store.publicKey}" async></script>`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="card">
      <h2>Mağazaya kurulum</h2>
      <ol className="steps">
        <li>
          ikas panelinde <b>Satış Kanalları → Online Mağaza → Ayarlar → Özel Kod</b> (veya temanın &lt;head&gt; alanı)
          bölümüne aşağıdaki satırı ekleyin.
        </li>
        <li>Herhangi bir kategori sayfasını açın; bölüm otomatik görünür.</li>
        <li>
          Konumu beğenmezseniz <b>Ayarlar → Yerleşim</b> bölümünden CSS seçici girin. Sorun ararken adres sonuna{' '}
          <code>?ms-debug=1</code> ekleyip tarayıcı konsoluna bakın.
        </li>
      </ol>
      <pre className="code">{code}</pre>
      <button
        className="btn"
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Kopyalandı ✓' : 'Kodu kopyala'}
      </button>
      <p className="muted small" style={{ marginTop: 16 }}>
        İsterseniz temanın kategori sayfasına bir "Özel HTML" bileşeni ekleyip içine <code>&lt;div id="ms-bestsellers"&gt;&lt;/div&gt;</code>{' '}
        yazarak bölümün yerini tam olarak belirleyebilirsiniz.
      </p>
    </div>
  );
}

function DangerZone({ store, onDeleted }) {
  return (
    <div className="card danger">
      <h3>Mağazayı sil</h3>
      <p className="muted small">Mağaza ve tüm hesaplanan sonuçlar silinir. Sitedeki script çalışmayı bırakır.</p>
      <button
        className="btn danger"
        onClick={async () => {
          if (!confirm(`"${store.name}" silinsin mi?`)) return;
          await api(`/stores/${store.id}`, { method: 'DELETE' });
          onDeleted();
        }}
      >
        Sil
      </button>
    </div>
  );
}

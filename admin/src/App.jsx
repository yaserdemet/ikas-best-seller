import { useEffect, useState, useCallback } from 'react';
import { api, auth } from './api.js';
import Login from './components/Login.jsx';
import StoreForm from './components/StoreForm.jsx';
import StoreDetail from './components/StoreDetail.jsx';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!auth.get());
  const [stores, setStores] = useState([]);
  const [meta, setMeta] = useState(null);
  const [selected, setSelected] = useState(null); // store id | 'new' | null
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, m] = await Promise.all([api('/stores'), meta ? Promise.resolve(meta) : api('/meta')]);
      setStores(list);
      setMeta(m);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [meta]);

  useEffect(() => {
    if (loggedIn) load();
  }, [loggedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />;

  const current = stores.find((s) => s.id === selected);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Öne Çıkan Ürünler</div>
        <button className="btn primary block" onClick={() => setSelected('new')}>
          + Mağaza ekle
        </button>
        <nav className="store-list">
          {stores.map((s) => (
            <button key={s.id} className={`store-item ${selected === s.id ? 'active' : ''}`} onClick={() => setSelected(s.id)}>
              <span className={`dot ${s.syncing ? 'busy' : s.lastSyncStatus || 'none'}`} />
              <span className="store-name">{s.name}</span>
              {!s.settings.enabled && <span className="tag">kapalı</span>}
            </button>
          ))}
          {!stores.length && <p className="muted small">Henüz mağaza yok.</p>}
        </nav>
        <button
          className="btn ghost block logout"
          onClick={() => {
            auth.clear();
            setLoggedIn(false);
          }}
        >
          Çıkış
        </button>
      </aside>

      <main className="content">
        {error && <div className="alert error">{error}</div>}
        {selected === 'new' && meta && (
          <StoreForm
            defaults={meta.defaults}
            onSaved={async (s) => {
              await load();
              setSelected(s.id);
            }}
            onCancel={() => setSelected(null)}
          />
        )}
        {current && meta && (
          <StoreDetail
            key={current.id}
            store={current}
            meta={meta}
            onChanged={load}
            onDeleted={async () => {
              setSelected(null);
              await load();
            }}
          />
        )}
        {!selected && (
          <div className="empty">
            <h2>Mağaza seçin</h2>
            <p className="muted">
              Soldan bir mağaza seçin ya da yeni mağaza ekleyin. Her mağaza için ikas'ta bir Özel Uygulama oluşturup
              Client ID / Client Secret bilgisini girmeniz gerekir.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

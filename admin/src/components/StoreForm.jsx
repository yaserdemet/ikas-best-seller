import { useState } from 'react';
import { api } from '../api.js';

/** Yeni mağaza ekleme ya da bağlantı bilgilerini güncelleme formu. */
export default function StoreForm({ store, onSaved, onCancel }) {
  const editing = !!store;
  const [form, setForm] = useState({
    name: store?.name || '',
    ikasStoreName: store?.ikasStoreName || '',
    clientId: store?.clientId || '',
    clientSecret: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...form };
      if (editing && !body.clientSecret) delete body.clientSecret;
      const saved = editing
        ? await api(`/stores/${store.id}`, { method: 'PUT', body })
        : await api('/stores', { method: 'POST', body });
      onSaved?.(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>{editing ? 'ikas bağlantısı' : 'Yeni mağaza'}</h2>
      {!editing && (
        <ol className="steps muted small">
          <li>ikas panelinde <b>Ayarlar → Özel Uygulamalarım → Özel Uygulama Oluştur</b> adımına gidin.</li>
          <li>
            Yetkiler: <b>Siparişleri okuma</b>, <b>Ürünleri okuma</b>, <b>Kategorileri okuma</b>. Yazma yetkisi gerekmez.
          </li>
          <li>Size verilen Client ID ve Client Secret'ı aşağıya girin.</li>
        </ol>
      )}
      <div className="grid2">
        <label className="field">
          <span>Mağaza adı (panelde görünen)</span>
          <input value={form.name} onChange={set('name')} placeholder="Nothing Bag" required />
        </label>
        <label className="field">
          <span>ikas mağaza adı</span>
          <div className="input-suffix">
            <input value={form.ikasStoreName} onChange={set('ikasStoreName')} placeholder="nothingbag" required />
            <span>.myikas.com</span>
          </div>
        </label>
        <label className="field">
          <span>Client ID</span>
          <input value={form.clientId} onChange={set('clientId')} required autoComplete="off" />
        </label>
        <label className="field">
          <span>Client Secret {editing && <em className="muted">(değiştirmeyecekseniz boş bırakın)</em>}</span>
          <input
            type="password"
            value={form.clientSecret}
            onChange={set('clientSecret')}
            required={!editing}
            autoComplete="new-password"
          />
        </label>
      </div>
      {error && <div className="alert error">{error}</div>}
      <div className="actions">
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Vazgeç
          </button>
        )}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>
    </form>
  );
}

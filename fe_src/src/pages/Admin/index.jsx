import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listConversations, login, logout, whoami } from './api';
import '../../styles/post.css';
import './admin.css';

/* /admin — the owner's door and, behind it, every conversation the site
   has had. One page, two states: the token form, then the list. Each row
   opens the conversation at its address (/chat/:sid), read-only there
   like for anyone — the owner reads, never speaks for a visitor. */
export default function Admin() {
  const [owner, setOwner] = useState(null); // null = checking
  useEffect(() => {
    whoami().then(setOwner).catch(() => setOwner(false));
  }, []);

  return (
    <section className="w-full pt-20 md:pt-24 font-sans min-h-[70vh]">
      <div className="max-w-4xl mx-auto px-5 sm:px-8">
        {owner === null && <p className="post-meta-text">Checking…</p>}
        {owner === false && <Door onOpen={() => setOwner(true)} />}
        {owner === true && <Conversations onLeave={() => setOwner(false)} />}
      </div>
    </section>
  );
}

function Door({ onOpen }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (await login(token.trim())) onOpen();
      else setError('Wrong token.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="post-head admin-door" onSubmit={submit}>
      <h1 className="post-title">Owner</h1>
      <p className="post-meta-text">
        <span>admin</span>
        <span className="sep">·</span>
        <span>OWNER_TOKEN</span>
      </p>
      <label className="admin-field">
        <span className="admin-label">Token</span>
        <input
          type="password"
          autoComplete="current-password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          aria-invalid={error ? 'true' : undefined}
          autoFocus
        />
      </label>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <button type="submit" className="admin-btn" disabled={busy || !token.trim()}>
        {busy ? 'Checking…' : 'Enter'}
      </button>
    </form>
  );
}

const fmtWhen = (iso) => {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function Conversations({ onLeave }) {
  const [rows, setRows] = useState([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const PAGE = 50;

  const load = useCallback(async (before) => {
    try {
      const page = await listConversations({ before, limit: PAGE });
      setRows((prev) => (before ? [...prev, ...page] : page));
      setDone(page.length < PAGE);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const leave = async () => {
    await logout();
    onLeave();
  };

  return (
    <>
      <header className="post-head admin-head">
        <h1 className="post-title">Conversations</h1>
        <p className="post-meta-text">
          <span>{rows.length}{done ? '' : '+'} loaded</span>
          <span className="sep">·</span>
          <button type="button" className="admin-link" onClick={leave}>log out</button>
        </p>
      </header>
      {error && <p className="admin-error" role="alert">{error}</p>}
      <ol className="admin-list">
        {rows.map((c) => (
          <li key={c.id}>
            <Link to={`/chat/${c.id}`} className="admin-row">
              <span className="admin-title">{c.title || <em>— no question yet —</em>}</span>
              <span className="admin-meta">
                <span>{c.turn_count} {c.turn_count === 1 ? 'turn' : 'turns'}</span>
                <span className="sep">·</span>
                <span title={c.visitor_id}>{(c.visitor_id || '').slice(0, 6)}</span>
                <span className="sep">·</span>
                <span>{fmtWhen(c.last_at)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {!done && rows.length > 0 && (
        <button type="button" className="admin-btn" onClick={() => load(rows[rows.length - 1].last_at)}>
          older
        </button>
      )}
      {done && rows.length === 0 && !error && <p className="post-meta-text">No conversations yet.</p>}
    </>
  );
}

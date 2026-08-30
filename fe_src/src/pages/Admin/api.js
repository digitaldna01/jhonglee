/* The owner's calls — /api/auth/* and the all-conversations list. Same
   origin, cookie-authenticated; nothing here is reachable for visitors. */

export async function whoami() {
  const res = await fetch('/api/auth/me');
  if (!res.ok) throw new Error(`auth check failed: ${res.status}`);
  return (await res.json()).owner === true;
}

/** Resolves true on success; false for a wrong token. Throws when login is
 *  not configured (404) or throttled (429). */
export async function login(token) {
  const res = await fetch('/api/auth/owner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (res.status === 204) return true;
  if (res.status === 401) return false;
  if (res.status === 404) throw new Error('Owner login is not configured on this server (OWNER_TOKEN).');
  if (res.status === 429) throw new Error('Too many attempts — wait a minute.');
  throw new Error(`login failed: ${res.status}`);
}

export async function logout() {
  await fetch('/api/auth/owner', { method: 'DELETE' });
}

/** Every conversation, newest activity first. `before` pages by last_at. */
export async function listConversations({ before, limit = 50 } = {}) {
  const q = new URLSearchParams({ scope: 'all', limit: String(limit) });
  if (before) q.set('before', before);
  const res = await fetch(`/api/chat/sessions?${q}`);
  if (res.status === 403) throw new Error('not the owner');
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json();
}

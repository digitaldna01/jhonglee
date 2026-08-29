/* ============================================================
   Landing — backend chat API client
   ------------------------------------------------------------
   Talks to be_src (/api/chat/*, same-origin via the vite/nginx
   proxy). Throws on network/HTTP failure — callers fall back to
   the on-device stand-in in rag/generate.js.
   ============================================================ */

/** Graph nodes + similarity edges from the server corpus. */
export async function fetchGraph({ signal } = {}) {
  const res = await fetch('/api/chat/graph', { signal });
  if (!res.ok) throw new Error(`graph fetch failed: ${res.status}`);
  return res.json();
}

/**
 * Stream an answer over SSE.
 *   sessionId: per-page-load id — the server keeps the transcript under it
 *   (history is still sent for older backends; the server prefers its own).
 *   onSources({sources, retrieval_ms, retrieval_model}) fires once,
 *   onDelta(text) per chunk; resolves with the `done` payload {model}.
 *   Throws RateLimitError (429) when the visitor has asked too much —
 *   scope 'visitor' | 'ip' (wait a minute) or 'global' (the site-wide
 *   daily budget is spent; back tomorrow).
 */
export class RateLimitError extends Error {
  constructor(retryAfter, scope = 'visitor') {
    super('rate limited');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.scope = scope;
  }
}

export async function streamAnswer({ question, sessionId, history = [], onSources, onDelta, signal }) {
  const res = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, session_id: sessionId, history }),
    signal,
  });
  if (res.status === 429) {
    throw new RateLimitError(
      Number(res.headers.get('Retry-After')) || 60,
      res.headers.get('X-RateLimit-Scope') || 'visitor',
    );
  }
  if (!res.ok || !res.body) throw new Error(`chat stream failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let donePayload = null;

  const handle = (raw) => {
    let event = 'message';
    let data = '';
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return;
    const obj = JSON.parse(data);
    if (event === 'sources') onSources?.(obj);
    else if (event === 'delta') onDelta?.(obj.text);
    else if (event === 'done') donePayload = obj;
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      handle(buf.slice(0, idx));
      buf = buf.slice(idx + 2);
    }
  }
  if (!donePayload) throw new Error('chat stream ended without done event');
  return donePayload;
}

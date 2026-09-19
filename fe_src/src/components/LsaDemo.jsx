import { useRef, useState } from "react";

// Interactive LSA search demo — a search box over 20 Newsgroups, embedded in
// the post. Talks to the be_src backend at /api/lsa/search (Vite proxies
// /api → :8000 in dev; nginx proxies it in prod). The backend holds the
// precomputed TF-IDF vocabulary + SVD projection and answers in ~1 ms.

const EXAMPLES = [
  "space shuttle launch",
  "car engine trouble",
  "the goalie made a great save",
  "encryption and government privacy",
  "my graphics card has no driver",
];

// mirror of the backend tokenizer (sklearn's default), to show which words
// the search never saw — stopwords and out-of-vocabulary terms just vanish
const TOKEN = /\b[\w][\w]+\b/gu;

export default function LsaDemo() {
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState(null); // the query the results belong to
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const search = async (q) => {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/lsa/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text }),
      });
      if (!res.ok) throw new Error(`search ${res.status}`);
      setData(await res.json());
      setAsked(text);
    } catch {
      setError("Can't reach the demo backend (/api). Is the server running?");
    } finally {
      setBusy(false);
    }
  };

  const runExample = (q) => {
    setQuery(q);
    search(q);
  };

  // back to the empty box: no query, no results, no footer
  const reset = () => {
    setQuery("");
    setAsked(null);
    setData(null);
    setError(null);
    inputRef.current?.focus();
  };

  // words of the asked query the search dropped (stopwords / unknown terms)
  const dropped =
    data && asked
      ? (asked.toLowerCase().match(TOKEN) || []).filter(
          (t, i, all) => !data.matched_terms.includes(t) && all.indexOf(t) === i
        )
      : [];

  const results = data?.results ?? [];

  return (
    <div className="not-prose my-7 w-full overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--mat)] shadow-[var(--shadow-card)]">
      {/* header */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] bg-[var(--color-bg-alt)] px-4 py-2.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--fg-2)]">
          lsa search · 20 newsgroups
        </span>
        <span className="font-mono text-xs tabular-nums text-[var(--fg-3)]">
          {data ? `${data.n_documents.toLocaleString()} docs` : "18,846 docs"} · 100 dims
        </span>
      </div>

      {/* search row */}
      <div className="flex flex-col gap-2.5 px-4 pb-3 pt-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search(query);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="type a query…"
            maxLength={300}
            className="min-w-0 flex-1 rounded-md border border-[var(--hairline)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--fg-1)] outline-none placeholder:text-[var(--fg-3)] focus:border-secondary"
          />
          <button
            type="submit"
            disabled={busy || !query.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold text-[var(--accent-fill-fg)] transition-colors hover:bg-secondary-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "…" : "Search"}
          </button>
          {(query || data || error) && (
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              aria-label="Reset the search"
              className="rounded-md border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--fg-3)] transition-colors hover:border-[var(--fg-3)] hover:text-[var(--fg-1)] disabled:opacity-40"
            >
              reset
            </button>
          )}
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-[var(--fg-3)]">try</span>
          {EXAMPLES.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => runExample(q)}
              className="rounded-full border border-[var(--hairline)] bg-[var(--panel)] px-2.5 py-0.5 text-xs text-[var(--fg-2)] transition-colors hover:border-secondary hover:text-secondary disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* results */}
      <div className="border-t border-[var(--hairline)] px-4 py-3">
        {error ? (
          <p className="py-4 text-center font-mono text-xs text-[#c0392b]">{error}</p>
        ) : !data ? (
          <p className="py-4 text-center font-mono text-xs text-[var(--fg-3)]">
            search 18,846 newsgroup posts by meaning — 100 numbers per document
          </p>
        ) : results.length === 0 ? (
          <p className="py-4 text-center font-mono text-xs text-[var(--fg-3)]">
            none of those words are in the 20k-term vocabulary — the query
            vector is all zeros
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {results.map((r) => (
              <li key={r.doc_id} className="flex flex-col gap-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-[var(--fg-3)]">
                    {r.rank}
                  </span>
                  <span className="font-mono text-xs font-semibold text-secondary">
                    {r.category}
                  </span>
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-[var(--fg-2)]">
                    cos {r.score.toFixed(3)}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--line-soft)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, r.score * 100)}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
                <p className="line-clamp-3 text-[13px] leading-snug text-[var(--fg-2)]">
                  {r.snippet || <em>(empty post)</em>}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* footer — what the search actually saw */}
      {data && asked && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--hairline)] bg-[var(--color-bg-alt)] px-4 py-2.5">
          <span className="text-[11px] uppercase tracking-wider text-[var(--fg-3)]">
            searched as
          </span>
          <span className="font-mono text-xs text-[var(--fg-1)]">
            {data.matched_terms.length ? data.matched_terms.join(" · ") : "—"}
          </span>
          {dropped.length > 0 && (
            <span className="font-mono text-xs text-[var(--fg-3)] line-through">
              {dropped.join(" · ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

import { Link, useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { LangProvider, useLang } from '../utils/lang';
import { fmtDate } from '../utils/format';
import Lightbox from '../components/Lightbox';
import BackLink from '../components/BackLink';
import { markZoomable, zoomTarget } from '../components/Lightbox/zoomable';
import '../styles/work.css';
import '../styles/post.css';

const postModules = import.meta.glob('../posts/*.mdx');

// every post's metadata (not its body), newest first — the order WORK shows
const ALL_POSTS = Object.entries(
  import.meta.glob('../posts/*.mdx', { eager: true, import: 'metadata' }),
)
  .map(([path, m]) => ({ slug: path.replace('../posts/', '').replace('.mdx', ''), ...m }))
  .filter((p) => p.title)
  .sort((a, b) => new Date(b.date) - new Date(a.date));

/* Newer / older by date — the same order as the WORK list, so the two
   links always mean "the one above / below this on that page". */
function PostNav({ slug }) {
  const i = ALL_POSTS.findIndex((p) => p.slug === slug);
  if (i === -1) return null;
  const newer = ALL_POSTS[i - 1];
  const older = ALL_POSTS[i + 1];
  return (
    <nav className="post-nav" aria-label="Neighbouring posts">
      {newer ? (
        <Link className="post-nav-link is-newer" to={`/posts/${newer.slug}`}>
          <span className="k">← Newer</span>
          <span className="t">{newer.title}</span>
        </Link>
      ) : <span />}
      {older ? (
        <Link className="post-nav-link is-older" to={`/posts/${older.slug}`}>
          <span className="k">Older →</span>
          <span className="t">{older.title}</span>
        </Link>
      ) : <span />}
    </nav>
  );
}

function LangToggle({ locales }) {
  const { locale, setLocale } = useLang();
  return (
    <div className="post-lang" role="group" aria-label="Language">
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          className={`post-lang-btn ${locale === code ? "is-active" : ""}`}
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function pickLocaleValue(value, locale, fallback) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return value[locale] ?? value[fallback] ?? Object.values(value)[0] ?? null;
}

function PostTitle({ meta }) {
  const { locale } = useLang();
  const fallback = meta.defaultLocale ?? "en";
  const display =
    pickLocaleValue(meta.displayTitle, locale, fallback) ??
    pickLocaleValue(meta.title, locale, fallback) ??
    "";
  return (
    <h1 className="post-title">
      {display.split("\n").map((line, i, arr) => (
        <span key={i}>
          {line}
          {i < arr.length - 1 && (
            <>
              {" "}
              <br className="hidden md:inline" />
            </>
          )}
        </span>
      ))}
    </h1>
  );
}

export default function Post() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: 'loading', meta: null, Component: null });
  const [zoomed, setZoomed] = useState(null);
  const bodyRef = useRef(null);

  useEffect(() => {
    const loader = postModules[`../posts/${slug}.mdx`];
    if (!loader) {
      setState({ status: '404', meta: null, Component: null });
      return;
    }
    loader().then((mod) => {
      setState({ status: 'ok', meta: mod.metadata ?? {}, Component: mod.default });
      window.scrollTo(0, 0);
    });
  }, [slug]);

  const { status, meta, Component } = state;

  // every image worth enlarging gets a zoom cursor — re-checked whenever the
  // body changes (language toggle swaps the whole tree)
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return undefined;
    markZoomable(root);
    const mo = new MutationObserver(() => markZoomable(root));
    mo.observe(root, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [status]);

  if (status === 'loading') return <p className="pt-24 text-center">Loading…</p>;
  if (status === '404' || !meta) return <p className="pt-24 text-center">404 - Post Not Found</p>;

  const locales = Array.isArray(meta.locales) ? meta.locales : null;
  const initial = meta.defaultLocale ?? locales?.[0] ?? "en";

  return (
    <LangProvider initial={initial}>
      <section className="w-full pt-20 md:pt-24 font-sans overflow-x-clip">
        <div className="max-w-4xl mx-auto px-5 sm:px-8">
          <header className="post-head">
            <BackLink to="/work" inFlow>back to work</BackLink>
            <PostTitle meta={meta} />
            <div className="post-meta-row">
              {/* what · when · built with — the same facts the WORK card and the graph show */}
              <p className="post-meta-text">
                {meta.category}
                <span className="sep">·</span>
                {fmtDate(meta.date)}
                {meta.stack && (
                  <>
                    <span className="sep">·</span>
                    {meta.stack}
                  </>
                )}
              </p>
              {locales && locales.length > 1 && <LangToggle locales={locales} />}
            </div>
          </header>
          {Component && (
            <div
              className="post-body"
              ref={bodyRef}
              onClick={(e) => {
                const target = zoomTarget(e);
                if (target) { e.preventDefault(); setZoomed(target); }
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const target = zoomTarget(e);
                if (target) { e.preventDefault(); setZoomed(target); }
              }}
            >
              <div className="prose"><Component /></div>
            </div>
          )}
          <Lightbox image={zoomed} onClose={() => setZoomed(null)} />
          <PostNav slug={slug} />
        </div>
      </section>
    </LangProvider>
  );
}

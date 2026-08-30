import { useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { LangProvider, useLang } from '../utils/lang';
import Lightbox from '../components/Lightbox';
import { markZoomable, zoomTarget } from '../components/Lightbox/zoomable';
import '../styles/work.css';
import '../styles/post.css';

const postModules = import.meta.glob('../posts/*.mdx');

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
    <div className="text-[length:var(--h2)] text-center mb-2 break-keep text-balance">
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
    </div>
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
          <PostTitle meta={meta} />
          <div className="post-meta-row">
            <p className="text-[length:var(--caption)] text-center post-meta-text">
              {meta.category} | {meta.date}
            </p>
            {locales && locales.length > 1 && <LangToggle locales={locales} />}
          </div>
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
        </div>
      </section>
    </LangProvider>
  );
}

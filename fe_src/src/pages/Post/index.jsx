import { useParams } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { LangProvider, useLang } from '../../utils/lang';
import { fmtDate } from '../../utils/format';
import PostNav from './PostNav';
import Related from './Related';
import Lightbox from '../../components/Lightbox';
import BackLink from '../../components/BackLink';
import NotFound from '../NotFound';
import { markZoomable, zoomTarget } from '../../components/Lightbox/zoomable';
import '../../styles/work.css';
import '../../styles/post.css';

const postModules = import.meta.glob('../../posts/*.mdx');

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
    const loader = postModules[`../../posts/${slug}.mdx`];
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

  // the chunk usually lands in a few ms — the shell keeps the page's height
  // and the word only surfaces (CSS delay) if the wait grows noticeable
  if (status === 'loading') {
    return (
      <section className="w-full pt-20 md:pt-24 font-sans min-h-[70vh]" aria-busy="true">
        <div className="max-w-4xl mx-auto px-5 sm:px-8">
          <div className="post-head"><p className="post-meta-text post-loading">Loading</p></div>
        </div>
      </section>
    );
  }
  if (status === '404' || !meta) return <NotFound slug={slug} />;

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
          <Related slug={slug} />
          <PostNav slug={slug} />
        </div>
      </section>
    </LangProvider>
  );
}

import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';

const postModules = import.meta.glob('../posts/*.mdx');

export default function Post() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: 'loading', meta: null, Component: null });

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

  if (status === 'loading') return <p className="pt-24 text-center">Loading…</p>;
  if (status === '404' || !meta) return <p className="pt-24 text-center">404 - Post Not Found</p>;

  return (
    <section className="w-full pt-20 md:pt-24 font-sans">
      <div className="max-w-3xl mx-auto px-[var(--layout-margin)]">
        <div className="text-[length:var(--h2)] text-center mb-2">{meta.title}</div>
        <p className="text-[length:var(--caption)] text-center mb-8">
          {meta.category} | {meta.date}
        </p>
        {Component && <div className="prose"><Component /></div>}
      </div>
    </section>
  );
}

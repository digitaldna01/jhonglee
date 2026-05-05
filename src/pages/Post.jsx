import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import posts from '../data/posts.json';

const postModules = import.meta.glob('../posts/*.mdx');

export default function Post() {
  const { slug } = useParams();
  const [PostComponent, setPostComponent] = useState(null);
  const postMeta = posts.find((p) => p.slug === slug);

  useEffect(() => {
    const loader = postModules[`../posts/${slug}.mdx`];
    if (loader) {
      loader().then((mod) => setPostComponent(() => mod.default));
    } else {
      console.warn('Post not found:', slug);
    }
  }, [slug]);

  if (!postMeta) return <p className="pt-24 text-center">404 - Post Not Found</p>;
  if (!PostComponent) return <p className="pt-24 text-center">Loading…</p>;

  return (
    <section className="w-full pt-20 md:pt-24 font-sans">
      <div className="max-w-3xl mx-auto px-[var(--layout-margin)]">
        <div className="text-[length:var(--h2)] text-center mb-2">{postMeta.title}</div>
        <p className="text-[length:var(--caption)] text-center mb-8">
          {postMeta.category} | {postMeta.date}
        </p>
        <PostComponent />
      </div>
    </section>
  );
}

import { Link } from 'react-router-dom';

// every post's metadata (not its body), newest first — the order WORK shows
const ALL_POSTS = Object.entries(
  import.meta.glob('../../posts/*.mdx', { eager: true, import: 'metadata' }),
)
  .map(([path, m]) => ({ slug: path.replace('../../posts/', '').replace('.mdx', ''), ...m }))
  .filter((p) => p.title)
  .sort((a, b) => new Date(b.date) - new Date(a.date));

/* Newer / older by date — the same order as the WORK list, so the two
   links always mean "the one above / below this on that page". */
export default function PostNav({ slug }) {
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


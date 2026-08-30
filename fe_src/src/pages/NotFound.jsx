import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import BackLink from '../components/BackLink';
import { ALL_POSTS } from './Post/posts';
import '../styles/post.css';

/* One empty state for the whole site: an unknown post slug and an unknown
   route land here. Same masthead as a post — the address that failed sits
   where the meta line would, and the newest posts stand in for the body,
   so the page is an exit rather than a wall. */
export default function NotFound({ slug }) {
  const { pathname } = useLocation();
  const address = slug ? `/posts/${slug}` : pathname;
  const latest = ALL_POSTS.slice(0, 3);
  return (
    <section className="w-full pt-20 md:pt-24 font-sans min-h-[70vh]">
      <div className="max-w-4xl mx-auto px-5 sm:px-8">
        <header className="post-head">
          <BackLink to="/work" inFlow>back to work</BackLink>
          <h1 className="post-title">{slug ? 'No post at this address.' : 'No page at this address.'}</h1>
          <p className="post-meta-text nf-address">
            <span className="nf-code">404</span>
            <span className="sep">·</span>
            <span className="nf-path">{address}</span>
          </p>
        </header>
        <div className="post-body">
          <p className="nf-lead">It may have moved or been renamed, or the link was copied short.</p>
          <nav className="nf-latest" aria-labelledby="nf-latest-h">
            <h2 id="nf-latest-h" className="related-h">Newest</h2>
            {latest.map((p) => (
              <Link key={p.slug} className="post-nav-link" to={`/posts/${p.slug}`}>
                <span className="k">{p.category}</span>
                <span className="t">{p.title}</span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}

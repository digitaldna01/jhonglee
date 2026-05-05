import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/blog.css";

const mdxModules = import.meta.glob("../posts/*.mdx", { eager: true });
const blogData = Object.entries(mdxModules)
  .map(([path, mod]) => ({
    slug: path.replace("../posts/", "").replace(".mdx", ""),
    ...(mod.metadata ?? {}),
  }))
  .filter((p) => p.title);

const pad2 = (n) => String(n).padStart(2, "0");

const FILTERS = [
  { key: "all",     label: "All Posts" },
  { key: "blog",    label: "Blog" },
  { key: "logical", label: "Logical" },
  { key: "visual",  label: "Visual" },
  { key: "gallery", label: "Gallery" },
];

function filterPosts(posts, key) {
  if (key === "all") return posts;
  return posts.filter((p) => p.subcategory === key);
}

function Header({ counts }) {
  return (
    <header className="proj-header">
      <div className="proj-container">
        <div className="proj-header-grid">
          <div>
            <p className="proj-eyebrow">
              <span className="proj-eyebrow-rule" />
              WORKING ARCHIVE · 2023 — 2026
            </p>
            <h1 className="proj-title">
              <em>Ideas</em>, builds <span className="ampersand">&amp;</span>
              <br />
              visual logs.
            </h1>
            <p className="proj-lede">
              A working archive of ideas, builds, and observations — from
              engineering notes and project reflections to visual experiments,
              design references, and everyday logs.
            </p>
          </div>
          <div className="proj-stats">
            <div className="proj-stat">
              <span className="proj-stat-num">{pad2(counts.all)}</span>
              <span className="proj-stat-label">Total</span>
            </div>
            <div className="proj-stat">
              <span className="proj-stat-num">
                <span className="accent-l">{pad2(counts.projects)}</span>
              </span>
              <span className="proj-stat-label">Projects</span>
            </div>
            <div className="proj-stat">
              <span className="proj-stat-num">
                <span className="accent-v">{pad2(counts.posts)}</span>
              </span>
              <span className="proj-stat-label">Posts</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Toolbar({ filter, sort, view, counts, onFilter, onSort, onView }) {
  return (
    <div className="proj-toolbar">
      <div className="proj-container">
        <div className="proj-toolbar-inner">
          <div
            className="proj-filters"
            role="tablist"
            aria-label="Filter posts"
          >
            {FILTERS.map(({ key, label }) => {
              const count = counts[key] ?? 0;
              const isActive = filter === key;
              const catClass = key !== "all" ? `is-${key.toLowerCase()}` : "";
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={isActive}
                  className={`proj-filter ${catClass} ${isActive ? "is-active" : ""}`}
                  onClick={() => onFilter(key)}
                >
                  {label}
                  <span className="proj-filter-count">/ {pad2(count)}</span>
                </button>
              );
            })}
          </div>
          <div className="proj-tools">
            <label className="proj-sort">
              <span>Sort</span>
              <select
                className="proj-sort-select"
                value={sort}
                onChange={(e) => onSort(e.target.value)}
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="title">A–Z</option>
              </select>
            </label>
            <div
              className="proj-view-toggle"
              role="group"
              aria-label="View toggle"
            >
              <button
                className={`proj-view-btn ${view === "grid" ? "is-active" : ""}`}
                onClick={() => onView("grid")}
                aria-label="Grid view"
                title="Grid view"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect
                    x="0.5"
                    y="0.5"
                    width="5"
                    height="5"
                    stroke="currentColor"
                  />
                  <rect
                    x="8.5"
                    y="0.5"
                    width="5"
                    height="5"
                    stroke="currentColor"
                  />
                  <rect
                    x="0.5"
                    y="8.5"
                    width="5"
                    height="5"
                    stroke="currentColor"
                  />
                  <rect
                    x="8.5"
                    y="8.5"
                    width="5"
                    height="5"
                    stroke="currentColor"
                  />
                </svg>
              </button>
              <button
                className={`proj-view-btn ${view === "list" ? "is-active" : ""}`}
                onClick={() => onView("list")}
                aria-label="List view"
                title="List view"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <line x1="0" y1="2" x2="14" y2="2" stroke="currentColor" />
                  <line x1="0" y1="7" x2="14" y2="7" stroke="currentColor" />
                  <line x1="0" y1="12" x2="14" y2="12" stroke="currentColor" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PostCard({ post, index, onPick }) {
  const catClass = `is-${post.subcategory ?? "blog"}`;
  const isFeatured = index === 0;
  const cleanKeywords = post.keywords?.filter((k) => k.trim()) ?? [];

  return (
    <article
      className={`proj-card ${catClass}${isFeatured ? " is-featured" : ""}`}
      onClick={() => onPick(post.slug)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onPick(post.slug)}
    >
      <div className="proj-card-body">
        <div className="proj-card-thumb">
          {post.thumbnail && (
            <img
              className="proj-card-thumb-img"
              src={post.thumbnail}
              alt={post.title}
            />
          )}
          <span className="proj-card-index">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="proj-card-hemi">
            <span className="proj-card-hemi-dot" />
            {post.category}
          </span>
          <div className="proj-card-overlay">
            <span className="proj-card-cta">
              Read Post
              <svg className="proj-card-cta-arrow" width="24" height="8" viewBox="0 0 24 8" fill="none" aria-hidden="true">
                <path d="M0 4h20M16 1l4 3-4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </div>
        </div>
        <div className="proj-card-meta-block">
          <p className="proj-card-meta">
            {post.date}
            <span className="proj-card-meta-divider" />
            {post.category}
          </p>
          <h2 className="proj-card-title">{post.title}</h2>
          {post.excerpt && <p className="proj-card-excerpt">{post.excerpt}</p>}
          {cleanKeywords.length > 0 && (
            <div className="proj-card-keywords">
              {cleanKeywords.map((kw, i) => (
                <span key={i} className="proj-card-keyword">
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function PostRow({ post, index, onPick }) {
  const catClass = `is-${post.subcategory ?? "blog"}`;
  const cleanKeywords = post.keywords?.filter((k) => k.trim()) ?? [];

  return (
    <div
      className={`proj-row ${catClass}`}
      onClick={() => onPick(post.slug)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onPick(post.slug)}
    >
      <span className="proj-row-index">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="proj-row-thumb">
        {post.thumbnail && <img src={post.thumbnail} alt={post.title} />}
      </div>
      <div className="proj-row-titlebox">
        <p className="proj-row-title">{post.title}</p>
        {post.excerpt && <p className="proj-row-sub">{post.excerpt}</p>}
      </div>
      <div className="proj-row-keywords">
        {cleanKeywords.slice(0, 2).join(" · ")}
      </div>
      <div className="proj-row-date">{post.date}</div>
      <div className="proj-row-arrow">
        <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
          <line
            x1="0"
            y1="6"
            x2="18"
            y2="6"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M13 1l5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}

export default function Blog() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState("grid");

  const counts = useMemo(() => ({
    all:      blogData.length,
    blog:     blogData.filter((p) => p.subcategory === "blog").length,
    logical:  blogData.filter((p) => p.subcategory === "logical").length,
    visual:   blogData.filter((p) => p.subcategory === "visual").length,
    gallery:  blogData.filter((p) => p.subcategory === "gallery").length,
    projects: blogData.filter((p) => p.category === "PROJECTS").length,
    posts:    blogData.filter((p) => p.category === "POST").length,
  }), []);

  const filtered = useMemo(() => {
    const list = filter === "all" ? blogData : filterPosts(blogData, filter);
    if (sort === "newest") return [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (sort === "oldest") return [...list].sort((a, b) => new Date(a.date) - new Date(b.date));
    if (sort === "title")  return [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
  }, [filter, sort]);

  const onPick = (slug) => navigate(`/posts/${slug}`);

  return (
    <div className="proj-page">
      <Header counts={counts} />
      <Toolbar
        filter={filter}
        sort={sort}
        view={view}
        counts={counts}
        onFilter={setFilter}
        onSort={setSort}
        onView={setView}
      />
      <div className="proj-results">
        <div className="proj-container">
          {filtered.length === 0 ? (
            <div className="proj-empty">
              <h3 className="proj-empty-title">No posts found</h3>
              <p>Try selecting a different category.</p>
            </div>
          ) : view === "grid" ? (
            <div className="proj-grid">
              {filtered.map((post, i) => (
                <PostCard key={post.id} post={post} index={i} onPick={onPick} />
              ))}
            </div>
          ) : (
            <div className="proj-list">
              {filtered.map((post, i) => (
                <PostRow key={post.id} post={post} index={i} onPick={onPick} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

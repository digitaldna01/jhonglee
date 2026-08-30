import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useTheme from '../../hooks/useTheme';
import useGraphData from '../../landing/useGraphData';
import { createGraph } from '../../landing/graph/createGraph';

/* Related — the landing map itself, at the end of the post, in the state
   you would see if you hovered this post on it: every node is present,
   this one is locked hot, its neighbours are lit and labelled, the rest
   are dimmed but still there — and still the map: it floats, you can
   drag it, hover a neighbour to see *its* neighbours, click to go.
   No caption: it is the same picture as the landing, so it explains
   itself by being the same picture.

   A post with no edge simply floats alone among the dim nodes — the
   picture says it. A post that is not a node (rag.node: false) shows
   nothing. */

export default function Related({ slug }) {
  const graph = useGraphData();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const canvasRef = useRef(null);
  const apiRef = useRef(null);

  const self = graph?.projects.find((p) => p.id === slug);
  const neighbours = self
    ? graph.edges
        .filter((e) => e.a === slug || e.b === slug)
        .map((e) => graph.projects.find((p) => p.id === (e.a === slug ? e.b : e.a)))
        .filter(Boolean)
    : [];

  useEffect(() => {
    if (!self || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    const narrow = window.matchMedia('(max-width: 720px)').matches;
    const lit = new Set(neighbours.map((n) => n.id));
    let hoverChangedAt = 0; // on touch, a tap on an unnamed dot reveals first, goes second
    const api = createGraph(canvas, {
      projects: graph.projects,
      edges: graph.edges,
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      quiet: narrow,
      compact: narrow,
      // the free band is the whole canvas, minus room for a label on top
      measure: () => ({ top: 26, bottom: canvas.clientHeight - 14 }),
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
      // the pointer explores; when it leaves, this post is hot again
      onHover: (id) => {
        hoverChangedAt = performance.now();
        if (!id) api.focusNode(slug);
      },
      onSelect: (id) => {
        if (id === slug) return;
        // a tap that just revealed a dimmed node's name is not yet a choice
        if (narrow && !lit.has(id) && performance.now() - hoverChangedAt < 400) return;
        const url = graph.projects.find((p) => p.id === id)?.url;
        if (url) navigate(url);
      },
    });
    api.focusNode(slug);
    apiRef.current = api;
    if (import.meta.env.DEV) window.__related = api; // for automated checks

    // only animate while on screen (a reader scrolling the body pays nothing)
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting && !document.hidden ? api.resume() : api.pause()),
      { threshold: 0.1 },
    );
    io.observe(canvas);
    const onVisibility = () => (document.hidden ? api.pause() : api.resume());
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      apiRef.current = null;
      api.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, slug]);

  useEffect(() => { apiRef.current?.setTheme(theme); }, [theme]);

  if (!self) return null;

  return (
    <section className="related" aria-labelledby="related-h">
      <h2 id="related-h" className="related-h">Related</h2>
      <div className="related-map">
        <canvas ref={canvasRef} className="related-canvas" aria-hidden="true" />
      </div>
      {/* the keyboard / screen-reader path: the same neighbours as links */}
      {neighbours.length > 0 && (
        <ul className="related-sr">
          {neighbours.map((n) => (
            <li key={n.id}><Link to={n.url}>{n.title}</Link></li>
          ))}
        </ul>
      )}
    </section>
  );
}

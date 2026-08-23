import { useEffect, useRef } from 'react';
import { createGraph } from '../graph/createGraph';
import { PROJECTS } from '../data/corpus';
import { EDGES } from '../data/retrieval';

/* Owns the canvas graph's lifecycle. The imperative API (injectQuery,
   focusNode, …) is exposed through `graphRef` for the page to drive. */
export default function MapLayer({ theme, introActive, onHover, onSelect, graphRef }) {
  const canvasRef = useRef(null);
  const onHoverRef = useRef(onHover);
  const onSelectRef = useRef(onSelect);
  onHoverRef.current = onHover;
  onSelectRef.current = onSelect;

  useEffect(() => {
    const api = createGraph(canvasRef.current, {
      projects: PROJECTS,
      edges: EDGES,
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      quiet: window.matchMedia('(max-width: 720px)').matches,
      theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
      onHover: (id) => onHoverRef.current?.(id),
      onSelect: (id) => onSelectRef.current?.(id),
    });
    if (graphRef) graphRef.current = api;

    const onVisibility = () => (document.hidden ? api.pause() : api.resume());
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (graphRef) graphRef.current = null;
      api.destroy();
    };
  }, [graphRef]);

  useEffect(() => { graphRef?.current?.setTheme(theme); }, [theme, graphRef]);
  useEffect(() => { graphRef?.current?.setIntro(introActive); }, [introActive, graphRef]);

  return (
    <div className="map-layer">
      <canvas ref={canvasRef} className="graph" aria-hidden="true" />
      <div className="scrim" aria-hidden="true" />
    </div>
  );
}

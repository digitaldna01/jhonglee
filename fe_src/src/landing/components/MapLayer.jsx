import { useEffect, useRef } from 'react';
import { createGraph } from '../graph/createGraph';

/* Owns the canvas graph's lifecycle. Node/edge data comes in as props
   (server corpus, or the bundled fallback). The imperative API
   (focusNode, setIntro, setTheme, …) is exposed through `graphRef`.

   The graph's free band is measured from the page: below the intro
   copy, above the dock — so it grows into whatever a device leaves
   free instead of assuming viewport fractions. */
const BAND_GAP = 20;

function measureBand() {
  const intro = document.querySelector('.intro:not(.gone)');
  const dock = document.querySelector('.dock');
  const top = intro ? intro.getBoundingClientRect().bottom + BAND_GAP : null;
  const bottom = dock ? dock.getBoundingClientRect().top - BAND_GAP : null;
  return top === null && bottom === null ? null : { top: top ?? undefined, bottom: bottom ?? undefined };
}
export default function MapLayer({ theme, introActive, projects, edges, onHover, onSelect, graphRef }) {
  const canvasRef = useRef(null);
  const onHoverRef = useRef(onHover);
  const onSelectRef = useRef(onSelect);
  onHoverRef.current = onHover;
  onSelectRef.current = onSelect;

  useEffect(() => {
    const api = createGraph(canvasRef.current, {
      projects,
      edges,
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      quiet: window.matchMedia('(max-width: 720px)').matches,
      compact: window.matchMedia('(max-width: 720px)').matches,
      measure: measureBand,
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
  }, [graphRef, projects, edges]);

  useEffect(() => { graphRef?.current?.setTheme(theme); }, [theme, graphRef]);
  useEffect(() => { graphRef?.current?.setIntro(introActive); }, [introActive, graphRef]);

  return (
    <div className="map-layer">
      <canvas ref={canvasRef} className="graph" aria-hidden="true" />
      <div className="scrim" aria-hidden="true" />
    </div>
  );
}

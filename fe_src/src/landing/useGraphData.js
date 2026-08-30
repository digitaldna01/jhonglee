import { useEffect, useState } from 'react';
import { fetchGraph } from './rag/client';
import { PROJECTS } from './data/corpus';
import { EDGES } from './data/retrieval';

/* The landing map's nodes + similarity edges, shared by the map and by a
   post's Related section so both draw the same picture. Server corpus
   first; the bundled copy when the backend is down. Fetched once per
   page load — moving between posts does not refetch. */
let cached = null;
let inflight = null;

function load() {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetchGraph()
      .then((d) => ({ projects: d.projects, edges: d.edges }))
      .catch(() => ({ projects: PROJECTS, edges: EDGES }))
      .then((d) => { cached = d; return d; });
  }
  return inflight;
}

export default function useGraphData() {
  const [data, setData] = useState(cached);
  useEffect(() => {
    if (cached) return undefined;
    let mounted = true;
    load().then((d) => mounted && setData(d));
    return () => { mounted = false; };
  }, []);
  return data;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import useTheme from '../hooks/useTheme';
import useChat from '../landing/useChat';
import MapLayer from '../landing/components/MapLayer';
import Intro from '../landing/components/Intro';
import Dock from '../landing/components/Dock';
import ChatThread from '../landing/components/ChatThread';
import ContactCorner from '../landing/components/ContactCorner';
import BackLink from '../components/BackLink';
import { fetchGraph } from '../landing/rag/client';
import { PROJECTS } from '../landing/data/corpus';
import { EDGES } from '../landing/data/retrieval';
import '../styles/landing.css';

/* Landing — full-viewport similarity map with a RAG chat session.
   The first question slides the map up and opens the thread; back to
   map (or Esc, or the wordmark) reverses everything. */
export default function Info() {
  const { theme } = useTheme();
  const graphRef = useRef(null);
  const chat = useChat(graphRef);
  const [graphData, setGraphData] = useState(null);
  const [activeCite, setActiveCite] = useState(null);

  // non-scrolling page + transparent navbar while this route is mounted
  useEffect(() => {
    document.documentElement.classList.add('route-landing');
    return () => document.documentElement.classList.remove('route-landing');
  }, []);

  // graph data: server corpus first, bundled copy when the backend is down
  useEffect(() => {
    let mounted = true;
    fetchGraph()
      .then((d) => mounted && setGraphData({ projects: d.projects, edges: d.edges }))
      .catch(() => mounted && setGraphData({ projects: PROJECTS, edges: EDGES }));
    return () => { mounted = false; };
  }, []);

  // Esc and the JHL. wordmark both end the session and restore the map
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && chat.inChat) chat.exitChat();
    };
    const onHome = () => chat.exitChat();
    document.addEventListener('keydown', onKey);
    window.addEventListener('jhl:home', onHome);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('jhl:home', onHome);
    };
  }, [chat]);

  const onCiteHover = useCallback((id) => {
    setActiveCite(id);
    if (id) graphRef.current?.focusNode(id);
    else graphRef.current?.setHover(null);
  }, []);

  const onCiteClick = useCallback(() => {
    /* project detail panel lands in the next step */
  }, []);

  return (
    <div className={`landing${chat.inChat ? ' is-chat' : ''}`}>
      {graphData && (
        <MapLayer
          theme={theme}
          introActive={!chat.inChat}
          projects={graphData.projects}
          edges={graphData.edges}
          onHover={setActiveCite}
          graphRef={graphRef}
        />
      )}
      <Intro gone={chat.inChat} />

      <section className="chat" aria-label="Conversation">
        <BackLink onClick={chat.exitChat}>back to map</BackLink>
        <ChatThread
          messages={chat.messages}
          activeCite={activeCite}
          onCiteHover={onCiteHover}
          onCiteClick={onCiteClick}
        />
      </section>

      <Dock inChat={chat.inChat} busy={chat.busy} onAsk={chat.ask} />
      <ContactCorner />
    </div>
  );
}

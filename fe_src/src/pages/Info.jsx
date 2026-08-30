import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import useTheme from '../hooks/useTheme';
import useChat from '../landing/useChat';
import MapLayer from '../landing/components/MapLayer';
import Intro from '../landing/components/Intro';
import Dock from '../landing/components/Dock';
import ChatThread from '../landing/components/ChatThread';
import ContactCorner from '../landing/components/ContactCorner';
import BackLink from '../components/BackLink';
import useGraphData from '../landing/useGraphData';
import '../styles/landing.css';

/* Landing — full-viewport similarity map with a RAG chat session.
   The first question slides the map up and opens the thread; back to
   map (or Esc, or the wordmark) reverses everything. The same page
   serves /chat/:sid — a conversation opened by its address. */
export default function Info() {
  const { theme } = useTheme();
  const graphRef = useRef(null);
  const { sid } = useParams(); // /chat/:sid — undefined on "/"
  const chat = useChat(graphRef, sid);
  // opened from the owner's list: "back" means that list, not the map
  const fromAdmin = useLocation().state?.from === 'admin';
  const navigate = useNavigate();
  const exitChat = chat.exitChat;
  const leave = useCallback(() => (fromAdmin ? navigate('/admin') : exitChat()), [fromAdmin, navigate, exitChat]);
  const graphData = useGraphData();
  const [activeCite, setActiveCite] = useState(null);
  const composerRef = useRef(null);

  // non-scrolling page + transparent navbar while this route is mounted
  useEffect(() => {
    document.documentElement.classList.add('route-landing');
    return () => document.documentElement.classList.remove('route-landing');
  }, []);

  // Esc and the JHL. wordmark both end the session and restore the map
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && chat.inChat) leave();
    };
    const onHome = () => chat.exitChat();
    document.addEventListener('keydown', onKey);
    window.addEventListener('jhl:home', onHome);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('jhl:home', onHome);
    };
  }, [chat, leave]);

  const onCiteHover = useCallback((id) => {
    setActiveCite(id);
    if (id) graphRef.current?.focusNode(id);
    else graphRef.current?.setHover(null);
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
      <Intro gone={chat.inChat} onAsk={() => composerRef.current?.focus()} />

      <section className="chat" aria-label="Conversation">
        {fromAdmin ? (
          <BackLink to="/admin">back to conversations</BackLink>
        ) : (
          <BackLink onClick={chat.exitChat}>back to map</BackLink>
        )}
        <ChatThread
          sid={chat.sessionId}
          messages={chat.messages}
          missing={chat.missing}
          activeCite={activeCite}
          onCiteHover={onCiteHover}
        />
      </section>

      <Dock
        inChat={chat.inChat}
        busy={chat.busy}
        onAsk={chat.ask}
        inputRef={composerRef}
        readOnly={chat.inChat && !chat.canContinue}
        note={chat.missing ? 'nothing at this address' : 'read only'}
      />
      <ContactCorner />
    </div>
  );
}

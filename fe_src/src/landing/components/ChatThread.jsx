import { useEffect, useRef } from 'react';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Split text so exact mentions of cited project titles become inline
   citations. Returns alternating [plain, match, plain, …] segments. */
function citeSegments(text, cited) {
  if (!cited?.length) return [text];
  const re = new RegExp(`(${cited.map((c) => esc(c.title)).join('|')})`, 'g');
  return text.split(re);
}

function BotBody({ msg, activeCite, onCiteHover, onCiteClick }) {
  if (msg.streaming) {
    return (
      <p className="stream">
        {msg.text || <span className="dim">Reading sources…</span>}
        <span className="caret" />
      </p>
    );
  }
  const byTitle = new Map((msg.sources ?? []).map((s) => [s.title, s]));
  return msg.text.split(/\n{2,}/).map((para, pi) => (
    <p key={pi}>
      {citeSegments(para, msg.sources).map((seg, si) => {
        const src = si % 2 === 1 ? byTitle.get(seg) : null;
        return src ? (
          <span
            key={si}
            className={`icite${activeCite === src.id ? ' active' : ''}`}
            onMouseEnter={() => onCiteHover(src.id)}
            onMouseLeave={() => onCiteHover(null)}
            onClick={() => onCiteClick(src.id)}
          >
            {seg}
          </span>
        ) : (
          seg
        );
      })}
    </p>
  ));
}

function BotMessage({ msg, activeCite, onCiteHover, onCiteClick }) {
  const f = msg.foot;
  return (
    <div className="msg bot">
      <div className="sources">
        <span className="lead">sources</span>
        {msg.sources && msg.sources.length === 0 && (
          <span className="lead dim">— no strong match</span>
        )}
        {msg.sources?.map((s) => (
          <span
            key={s.id}
            className={`cite${activeCite === s.id ? ' active' : ''}`}
            onMouseEnter={() => onCiteHover(s.id)}
            onMouseLeave={() => onCiteHover(null)}
            onClick={() => onCiteClick(s.id)}
          >
            {s.title}
          </span>
        ))}
      </div>
      <div className="body">
        <BotBody msg={msg} activeCite={activeCite} onCiteHover={onCiteHover} onCiteClick={onCiteClick} />
      </div>
      <div className="foot">
        {f.retrievalMs != null && (
          <>
            <span className="timing">
              {f.retrievalMs.toFixed(f.retrievalMs < 1 ? 2 : 1)} ms
            </span>
            <span className="dotsep">•</span>
            <span>retrieval {f.retrievalModel}</span>
            <span className="dotsep">•</span>
            <span>{msg.streaming ? 'generating…' : f.model}</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function ChatThread({ messages, activeCite, onCiteHover, onCiteClick }) {
  const threadRef = useRef(null);

  // drive the scroll container directly — never scrollIntoView
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="thread" role="log" aria-live="polite" ref={threadRef}>
      <div className="thread-inner">
        {messages.map((m) =>
          m.role === 'user' ? (
            <div className="msg user" key={m.id}>
              <div className="bubble">{m.text}</div>
            </div>
          ) : (
            <BotMessage
              key={m.id}
              msg={m}
              activeCite={activeCite}
              onCiteHover={onCiteHover}
              onCiteClick={onCiteClick}
            />
          ),
        )}
      </div>
    </div>
  );
}

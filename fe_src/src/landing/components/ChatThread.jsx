import { Fragment, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

// the post page reads this to offer "‹ back to chat" instead of "‹ back to work"
const FROM_CHAT = { from: 'chat' };

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Split text so exact mentions of cited project titles become inline
   citations. Returns alternating [plain, match, plain, …] segments. */
function citeSegments(text, cited) {
  if (!cited?.length) return [text];
  const re = new RegExp(`(${cited.map((c) => esc(c.title)).join('|')})`, 'g');
  return text.split(re);
}

function BotBody({ msg, activeCite, onCiteHover }) {
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
          <Link
            key={si}
            to={`/posts/${src.id}`}
            state={FROM_CHAT}
            className={`icite${activeCite === src.id ? ' active' : ''}`}
            onMouseEnter={() => onCiteHover(src.id)}
            onMouseLeave={() => onCiteHover(null)}
          >
            {seg}
          </Link>
        ) : (
          seg
        );
      })}
    </p>
  ));
}

/* "claude-haiku-4-5-20251001" → "haiku 4.5" */
const shortModel = (m) =>
  (m ?? '').replace(/^claude-/, '').replace(/-\d{8}$/, '').replace(/(\d)-(\d)/g, '$1.$2').replace(/-/g, ' ');

function BotMessage({ msg, activeCite, onCiteHover }) {
  const f = msg.foot;
  const sources = msg.sources ?? [];
  return (
    <div className="msg bot">
      <div className="body">
        <BotBody msg={msg} activeCite={activeCite} onCiteHover={onCiteHover} />
      </div>
      {msg.sources && (
        <div className="meta">
          <span className="sources">
            <span className="lead">sources</span>
            {sources.length === 0 && <span>no strong match</span>}
            {sources.map((s, i) => (
              <Fragment key={s.id}>
                {i > 0 && <span className="dotsep">·</span>}
                <Link
                  to={`/posts/${s.id}`}
                  state={FROM_CHAT}
                  className={`cite${activeCite === s.id ? ' active' : ''}`}
                  onMouseEnter={() => onCiteHover(s.id)}
                  onMouseLeave={() => onCiteHover(null)}
                >
                  {s.title}
                </Link>
              </Fragment>
            ))}
          </span>
          {f.retrievalMs != null && (
            <span className="stat" title={`retrieval: ${f.retrievalModel}`}>
              {f.retrievalMs < 1 ? f.retrievalMs.toFixed(2) : Math.round(f.retrievalMs)} ms
              <span className="dotsep"> · </span>
              {msg.streaming ? 'generating…' : shortModel(f.model)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChatThread({ messages, activeCite, onCiteHover }) {
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
            />
          ),
        )}
      </div>
    </div>
  );
}

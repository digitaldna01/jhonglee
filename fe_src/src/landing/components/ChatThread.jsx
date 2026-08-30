import { Fragment, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Where a citation links. Newer payloads carry `url` (null for page-less docs
   such as the bio); logs from before 2026-08-30 lack the field, so fall back
   to the post page for kinds that have one. */
const sourceHref = (s) => (s.url !== undefined ? s.url : ['post', 'project'].includes(s.kind) ? `/posts/${s.id}` : null);

/* Split text so exact mentions of cited project titles become inline
   citations. Returns alternating [plain, match, plain, …] segments. */
function citeSegments(text, cited) {
  if (!cited?.length) return [text];
  const re = new RegExp(`(${cited.map((c) => esc(c.title)).join('|')})`, 'g');
  return text.split(re);
}

function BotBody({ msg, activeCite, onCiteHover, back }) {
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
        const href = src && sourceHref(src);
        return href ? (
          <Link
            key={si}
            to={href}
            state={back}
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

function BotMessage({ msg, activeCite, onCiteHover, back }) {
  const f = msg.foot;
  const sources = msg.sources ?? [];
  return (
    <div className="msg bot">
      <div className="body">
        <BotBody msg={msg} activeCite={activeCite} onCiteHover={onCiteHover} back={back} />
      </div>
      {msg.sources && (
        <div className="meta">
          <span className="sources">
            <span className="lead">sources</span>
            {sources.length === 0 && <span>no strong match</span>}
            {sources.map((s, i) => (
              <Fragment key={s.id}>
                {i > 0 && <span className="dotsep">·</span>}
                {sourceHref(s) ? (
                  <Link
                    to={sourceHref(s)}
                    state={back}
                    className={`cite${activeCite === s.id ? ' active' : ''}`}
                    onMouseEnter={() => onCiteHover(s.id)}
                    onMouseLeave={() => onCiteHover(null)}
                  >
                    {s.title}
                  </Link>
                ) : (
                  <span className="cite plain">{s.title}</span>
                )}
              </Fragment>
            ))}
          </span>
          {f.retrievalMs != null && (
            <span className="stat" title={f.retrievalModel ? `retrieval: ${f.retrievalModel}` : undefined}>
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

export default function ChatThread({ sid, messages, missing = false, activeCite, onCiteHover }) {
  const threadRef = useRef(null);
  // the post page reads this to offer "‹ back to chat" — back to this address
  const back = { from: 'chat', sid };

  // drive the scroll container directly — never scrollIntoView
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div className="thread" role="log" aria-live="polite" ref={threadRef}>
      <div className="thread-inner">
        {missing && <p className="thread-note">No conversation at this address.</p>}
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
              back={back}
            />
          ),
        )}
      </div>
    </div>
  );
}

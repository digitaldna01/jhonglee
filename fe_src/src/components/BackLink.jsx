import { Link } from 'react-router-dom';
import './BackLink.css';

/* `to` → a route link (post → WORK); no `to` → a button (chat → map).
   `inFlow` lets the link drop into the page flow on narrow screens. */
export default function BackLink({ to, onClick, inFlow = false, children }) {
  const cls = `back-link${inFlow ? ' in-flow' : ''}`;
  const body = (
    <>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      {children}
    </>
  );
  return to ? (
    <Link to={to} className={cls} onClick={onClick}>{body}</Link>
  ) : (
    <button type="button" className={cls} onClick={onClick}>{body}</button>
  );
}

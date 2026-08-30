import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Lightbox.css';
import { TALL } from './zoomable';

/* Lightbox — an image from a post, shown at its own size on a dark mat.

   Rules that keep it honest:
   · never larger than the image's own pixels (--lb-w = naturalWidth),
     so nothing is upscaled and nothing looks broken
   · images that are barely bigger than the column are not zoomable —
     a click that changes nothing is a broken control (see zoomable.js)
   · tall images (long screenshots) fit by width and scroll inside
   · Esc, backdrop, the image itself and the close button all close it;
     focus goes to the close button and returns where it was; the page
     behind does not scroll; reduced motion skips the fades           */

export default function Lightbox({ image, onClose }) {
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(null);
  const restoreRef = useRef(null);

  const reduced = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // close with a short fade unless motion is reduced
  const close = () => {
    if (closing) return;
    if (reduced()) return onClose();
    setClosing(true);
  };

  useEffect(() => {
    if (!image) return undefined;
    setClosing(false); // the component stays mounted between images — start each one open
    restoreRef.current = document.activeElement;
    closeRef.current?.focus();

    // lock the page behind without a layout jump from the vanished scrollbar
    const html = document.documentElement;
    const gap = window.innerWidth - html.clientWidth;
    const prev = { overflow: html.style.overflow, pad: html.style.paddingRight };
    html.style.overflow = 'hidden';
    if (gap > 0) html.style.paddingRight = `${gap}px`;

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); } // one control: keep focus on it
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      html.style.overflow = prev.overflow;
      html.style.paddingRight = prev.pad;
      restoreRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  if (!image) return null;
  const tall = image.h / image.w > TALL;

  return createPortal(
    <div
      className={`lb${tall ? ' is-tall' : ''}${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={image.alt || 'Enlarged image'}
      style={{ '--lb-w': `${image.w}px` }}
      onClick={close}
      onAnimationEnd={(e) => { if (closing && e.target === e.currentTarget) onClose(); }}
    >
      <button
        ref={closeRef}
        type="button"
        className="lb-close"
        aria-label="Close"
        onClick={(e) => { e.stopPropagation(); close(); }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <figure className="lb-fig">
        <img src={image.src} alt={image.alt} width={image.w} height={image.h} />
        {image.alt && <figcaption className="lb-cap">{image.alt}</figcaption>}
      </figure>
    </div>,
    document.body,
  );
}

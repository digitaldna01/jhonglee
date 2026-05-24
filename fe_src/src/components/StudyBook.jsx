import { forwardRef, useCallback, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import "./StudyBook.css";

const PAGE_COUNT = 24;
const PDF_URL = "/pdf/projects/design-study/JaeHongLee_Studybook.pdf";
const PAGES = Array.from(
  { length: PAGE_COUNT },
  (_, i) =>
    `/images/projects/design-study/pages/page-${String(i + 1).padStart(2, "0")}.webp`,
);
// CMYK process inks — a press calibration strip.
const COLOR_BAR = ["#00aeef", "#ec008c", "#fff200", "#1b1a17"];

const pad = (n) => String(n).padStart(2, "0");

// react-pageflip hands each leaf a ref, so pages must forward it. Keep the page
// in normal flow (the library positions/transforms it during the flip).
const Page = forwardRef(function Page({ src, number, eager }, ref) {
  return (
    <div ref={ref} className="sb-page">
      <img
        src={src}
        alt={`Studybook page ${number}`}
        loading={eager ? "eager" : "lazy"}
        draggable={false}
        className="block h-full w-full object-cover"
      />
    </div>
  );
});

export default function StudyBook() {
  const bookRef = useRef(null);
  const frameRef = useRef(null);
  const [page, setPage] = useState(0);

  const onFlip = useCallback((e) => setPage(e.data), []);

  const flipPrev = () => bookRef.current?.pageFlip()?.flipPrev();
  const flipNext = () => bookRef.current?.pageFlip()?.flipNext();

  const toggleFullscreen = () => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else frameRef.current?.requestFullscreen?.();
  };

  return (
    <figure ref={frameRef} className="sb-atelier not-prose">
      <header className="sb-masthead">
        <span>
          Studybook — <b>Design Study</b>
        </span>
        <span className="sb-format">140 × 216 mm · 24 pp</span>
      </header>

      <div className="sb-frame">
        <div className="sb-stage">
          <div className="sb-bookwrap">
            <HTMLFlipBook
              ref={bookRef}
              width={400}
              height={618}
              size="stretch"
              minWidth={250}
              maxWidth={600}
              minHeight={386}
              maxHeight={927}
              showCover={true}
              usePortrait={true}
              mobileScrollSupport={true}
              maxShadowOpacity={0.5}
              flippingTime={700}
              onFlip={onFlip}
              className="studybook-flip mx-auto"
            >
              {PAGES.map((src, i) => (
                <Page key={i} src={src} number={i + 1} eager={i < 2} />
              ))}
            </HTMLFlipBook>
          </div>
        </div>

        <span className="sb-crop tl" aria-hidden />
        <span className="sb-crop tr" aria-hidden />
        <span className="sb-crop bl" aria-hidden />
        <span className="sb-crop br" aria-hidden />
      </div>

      <div className="sb-furniture">
        <div className="sb-colorbar" aria-hidden>
          {COLOR_BAR.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </div>

        <div className="sb-meta">
          <svg
            className="sb-reg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            aria-hidden
          >
            <circle cx="12" cy="12" r="6" />
            <line x1="12" y1="0" x2="12" y2="24" />
            <line x1="0" y1="12" x2="24" y2="12" />
          </svg>
          <span className="sb-counter">
            p.{pad(page + 1)} / {PAGE_COUNT}
          </span>
        </div>

        <div className="sb-nav-group">
          <button
            type="button"
            className="sb-nav"
            onClick={flipPrev}
            disabled={page === 0}
          >
            ‹ Prev
          </button>
          <button
            type="button"
            className="sb-nav"
            onClick={flipNext}
            disabled={page >= PAGE_COUNT - 1}
          >
            Next ›
          </button>
        </div>
      </div>

      <figcaption className="sb-footer">
        <span className="sb-colophon">
          <em>Design Study</em> — a studybook
        </span>
        <span className="sb-dot" aria-hidden>
          ·
        </span>
        <button type="button" className="sb-aux" onClick={toggleFullscreen}>
          ⤢ Fullscreen
        </button>
        <span className="sb-dot" aria-hidden>
          ·
        </span>
        <a className="sb-aux" href={PDF_URL} target="_blank" rel="noreferrer">
          ↓ PDF
        </a>
      </figcaption>
    </figure>
  );
}

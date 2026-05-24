import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/brain.css";
const _mdxModules = import.meta.glob("../posts/*.mdx", { eager: true });
const postBySlug = Object.fromEntries(
  Object.entries(_mdxModules).map(([path, mod]) => [
    path.replace("../posts/", "").replace(".mdx", ""),
    mod.metadata ?? {},
  ])
);

const LOGICAL = [
  {
    id: "project-7",
    slug: "quantumSimulator",
    title: "Quantum Simulator",
    date: "2024-08-15",
    subcategory: "logical",
    thumbnail: postBySlug["quantumSimulator"]?.thumbnail || "",
    excerpt:
      postBySlug["quantumSimulator"]?.excerpt ||
      "A quantum simulator built on Google's Tensor Network framework.",
    image: "/images/site/projects-page/brain/brain-logical-1.png",
    pos: { x: 36, y: 22 },
  },
  {
    id: "project-6",
    slug: "handPoseEstimation",
    title: "Hand Pose Estimation",
    date: "2024-05-15",
    subcategory: "logical",
    thumbnail: postBySlug["handPoseEstimation"]?.thumbnail || "",
    excerpt:
      postBySlug["handPoseEstimation"]?.excerpt ||
      "Machine-learning-driven hand pose estimation from real-time keypoint streams.",
    image: "/images/site/projects-page/brain/brain-logical-2.png",
    pos: { x: 28, y: 40 },
  },
  {
    id: "logical-3",
    slug: "lsatDemonLLM",
    title: "LSAT Demon LLM",
    date: "2025-09-01",
    subcategory: "logical",
    thumbnail: "",
    excerpt:
      "LLM development for an LSAT-prep platform — fine-tuned reasoning model with retrieval-augmented context.",
    image: "/images/site/projects-page/brain/brain-logical-3.png",
    pos: { x: 28, y: 58 },
  },
  {
    id: "logical-4",
    slug: "ivcResearch",
    title: "IVC Research",
    date: "2024-04-01",
    subcategory: "logical",
    thumbnail: "",
    excerpt:
      "Computer-vision research at BU IVC group — evaluating diffusion-model artifacts in human-perceptual studies.",
    image: "/images/site/projects-page/brain/brain-logical-4.png",
    pos: { x: 36, y: 76 },
  },
];

const VISUAL = [
  {
    id: "project-8",
    slug: "cogsAndGears",
    title: "Cogs and Gears",
    date: "2025-03-09",
    subcategory: "visual",
    thumbnail: postBySlug["cogsAndGears"]?.thumbnail || "",
    excerpt:
      postBySlug["cogsAndGears"]?.excerpt ||
      "I translated the poem's central metaphor into an interactive experience — each verse a small, moving gear.",
    image: "/images/site/projects-page/brain/brain-visual-1.png",
    pos: { x: 64, y: 22 },
  },
  {
    id: "project-1",
    slug: "designStudy",
    title: "Design Study",
    date: "2023-11-30",
    subcategory: "visual",
    thumbnail: postBySlug["designStudy"]?.thumbnail || "",
    excerpt:
      postBySlug["designStudy"]?.excerpt ||
      "An exploration of editorial layout, grid, and book design — published as a small bound volume.",
    image: "/images/site/projects-page/brain/brain-visual-2.png",
    pos: { x: 72, y: 40 },
  },
  {
    id: "project-2",
    slug: "gillSans",
    title: "Gill Sans",
    date: "2023-12-15",
    subcategory: "visual",
    thumbnail: postBySlug["gillSans"]?.thumbnail || "",
    excerpt:
      postBySlug["gillSans"]?.excerpt ||
      "A stop-motion typography study on the history and proportions of Eric Gill's Gill Sans.",
    image: "/images/site/projects-page/brain/brain-visual-3.png",
    pos: { x: 72, y: 58 },
  },
  {
    id: "project-3",
    slug: "visualArtPortfolio",
    title: "Visual Art Portfolio",
    date: "2023-08-15",
    subcategory: "visual",
    thumbnail: postBySlug["visualArtPortfolio"]?.thumbnail || "",
    excerpt:
      postBySlug["visualArtPortfolio"]?.excerpt ||
      "Selected paintings, drawings, and prints from my Visual Arts minor at Boston University.",
    image: "/images/site/projects-page/brain/brain-visual-4.png",
    pos: { x: 64, y: 76 },
  },
];

const ALL = [...LOGICAL, ...VISUAL];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
const idx2 = (n) => String(n + 1).padStart(2, "0");

function Marker({ project, index, isActive, onEnter, onLeave, onClick }) {
  return (
    <button
      className={`brain-marker is-${project.subcategory}${isActive ? " is-active" : ""}`}
      style={{ left: `${project.pos.x}%`, top: `${project.pos.y}%` }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onClick}
      aria-label={`${project.title} — ${project.subcategory} project`}
    >
      <span className="brain-marker-ring" aria-hidden="true" />
      <span className="brain-marker-ring is-2" aria-hidden="true" />
      <span className="brain-marker-core" aria-hidden="true" />
      <span className="brain-marker-num">{index + 1}</span>
    </button>
  );
}

function Connector({ active, cardSide, stageRef }) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!stageRef.current) return;
    const update = () => {
      const r = stageRef.current.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [stageRef]);

  if (!active || !size.w)
    return <svg className="brain-connector" aria-hidden="true" />;

  const px = (active.pos.x / 100) * size.w;
  const py = (active.pos.y / 100) * size.h;
  const cardX = cardSide === "left" ? -8 : size.w + 8;
  const midX = (px + cardX) / 2;
  const d = `M ${px} ${py} C ${midX} ${py}, ${midX} ${py}, ${cardX} ${py}`;

  return (
    <svg
      className="brain-connector"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
      aria-hidden="true"
    >
      <path d={d} className={`is-shown is-${active.subcategory}`} />
    </svg>
  );
}

function InfoCard({ active, side, offset, onPick, isMobile }) {
  if (!active && !isMobile)
    return <div className="brain-info" aria-hidden="true" />;
  if (!active) return null;

  const projIndex = ALL.findIndex((p) => p.id === active.id);
  const style = isMobile
    ? {}
    : side === "left"
      ? {
          right: `calc(100% + ${offset}px)`,
          top: `${active.pos.y}%`,
          transform: "translateY(-50%)",
        }
      : {
          left: `calc(100% + ${offset}px)`,
          top: `${active.pos.y}%`,
          transform: "translateY(-50%)",
        };

  return (
    <div
      className={`brain-info is-shown is-${active.subcategory}`}
      style={style}
      onMouseEnter={(e) => e.stopPropagation()}
    >
      <p className="brain-info-meta">
        <span className="brain-info-num">— {idx2(projIndex)}</span>
        <span className="brain-info-meta-divider" aria-hidden="true" />
        <span>{active.subcategory === "logical" ? "Logical" : "Visual"}</span>
      </p>
      <h2 className="brain-info-title">{active.title}</h2>
      <p className="brain-info-date">{fmtDate(active.date)}</p>
      {active.thumbnail && (
        <div className="brain-info-thumb">
          <img src={active.thumbnail} alt="" />
        </div>
      )}
      <p className="brain-info-excerpt">{active.excerpt}</p>
      <button className="brain-info-cta" onClick={() => onPick(active)}>
        Read project
        <span className="brain-info-cta-arrow" aria-hidden="true" />
      </button>
    </div>
  );
}

function MobileList({ onSelect }) {
  return (
    <div className="brain-container">
      <div className="brain-mobile-grid">
        <div className="brain-mobile-col is-logical">
          <h3 className="brain-mobile-col-title">Logical</h3>
          {LOGICAL.map((p, i) => (
            <button
              key={p.id}
              className="brain-mobile-item"
              onClick={() => onSelect(p)}
            >
              <span className="brain-mobile-item-num">{idx2(i)}</span>
              <span>
                <span className="brain-mobile-item-title">{p.title}</span>
                <span className="brain-mobile-item-date">
                  {fmtDate(p.date)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="brain-mobile-col is-visual">
          <h3 className="brain-mobile-col-title">Visual</h3>
          {VISUAL.map((p, i) => (
            <button
              key={p.id}
              className="brain-mobile-item"
              onClick={() => onSelect(p)}
            >
              <span className="brain-mobile-item-num">{idx2(i + 4)}</span>
              <span>
                <span className="brain-mobile-item-title">{p.title}</span>
                <span className="brain-mobile-item-date">
                  {fmtDate(p.date)}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Projects() {
  const navigate = useNavigate();
  const [active, setActive] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const enterTimer = useRef(null);
  const leaveTimer = useRef(null);
  const stageRef = useRef(null);

  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--brain-size", "960px");
    r.style.setProperty("--hover-delay", "80ms");
    r.style.setProperty("--card-offset", "24px");
    r.style.setProperty("--marker-size", "14px");
    r.style.setProperty("--marker-glow", "0.55");
    r.style.setProperty("--connector-op", "0.45");
    r.style.setProperty("--idle-amp", "1");
    return () => {
      [
        "--brain-size",
        "--hover-delay",
        "--card-offset",
        "--marker-size",
        "--marker-glow",
        "--connector-op",
        "--idle-amp",
      ].forEach((v) => r.style.removeProperty(v));
    };
  }, []);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 720);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleEnter = useCallback((p) => {
    clearTimeout(leaveTimer.current);
    clearTimeout(enterTimer.current);
    enterTimer.current = setTimeout(() => setActive(p), 80);
  }, []);

  const handleLeave = useCallback(() => {
    clearTimeout(enterTimer.current);
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setActive(null), 120);
  }, []);

  const onPick = useCallback(
    (p) => {
      navigate(`/posts/${p.slug}`);
    },
    [navigate],
  );

  const cardSide = active
    ? active.subcategory === "logical"
      ? "left"
      : "right"
    : null;

  return (
    <div className={`brain-page${isMobile ? " is-mobile" : ""}`}>
      <header className="brain-header">
        <div className="brain-container">
          <div className="brain-header-grid">
            <div>
              <div className="brain-eyebrow">
                <span className="brain-eyebrow-rule" aria-hidden="true" />
                <span>Brain View · Eight Projects, Two Hemispheres</span>
              </div>
              <h1 className="brain-title">
                <strong>Logical</strong> on the left.
                <br />
                <em>Visual</em> on the right.
              </h1>
              <p className="brain-lede">
                Hover any glowing marker to read the project — the left side of
                the brain holds engineering and research work, the right side
                holds typography, motion, and editorial work. The same eight
                projects, mapped onto a body.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="brain-container">
        <div className="brain-legend">
          <span className="brain-legend-item is-logical">
            <span className="brain-legend-dot" aria-hidden="true" />
            Logical · {LOGICAL.length} projects
          </span>
          <span className="brain-legend-item is-visual">
            <span className="brain-legend-dot" aria-hidden="true" />
            Visual · {VISUAL.length} projects
          </span>
        </div>
      </div>

      <section className="brain-stage-wrap">
        <div className="brain-container">
          <div className="brain-stage-shell">
            <div
              className="brain-stage"
              ref={stageRef}
              onMouseLeave={handleLeave}
            >
              <span className="brain-axis brain-axis-v" aria-hidden="true" />
              <span className="brain-axis brain-axis-h" aria-hidden="true" />
              <span className="brain-hemi-label is-logical">Logical</span>
              <span className="brain-hemi-label is-visual">Visual</span>

              <img
                className="brain-img"
                src={
                  active
                    ? active.image
                    : "/images/site/projects-page/brain/default-brain.png"
                }
                alt={
                  active
                    ? `Brain illustration — ${active.title}`
                    : "Brain illustration"
                }
              />

              <Connector
                active={active}
                cardSide={cardSide}
                stageRef={stageRef}
              />

              {ALL.map((p, i) => (
                <Marker
                  key={p.id}
                  project={p}
                  index={i}
                  isActive={active?.id === p.id}
                  onEnter={() => handleEnter(p)}
                  onLeave={handleLeave}
                  onClick={() => onPick(p)}
                />
              ))}

{!isMobile && (
                <InfoCard
                  active={active}
                  side={cardSide}
                  offset={24}
                  onPick={onPick}
                  isMobile={false}
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {isMobile && <MobileList onSelect={(p) => setActive(p)} />}
      {isMobile && (
        <InfoCard
          active={active}
          side={null}
          offset={0}
          onPick={onPick}
          isMobile={true}
        />
      )}
    </div>
  );
}

export default Projects;

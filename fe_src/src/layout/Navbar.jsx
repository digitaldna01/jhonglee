import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useTheme from '../hooks/useTheme';
import '../styles/navbar.css';

const NAV = [
  { label: 'CV', path: '/cv' },
  { label: 'WORK', path: '/work' },
];

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" />
      <line x1="12" y1="2" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22" />
      <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
      <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
      <line x1="2" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="19.1" x2="6.7" y2="17.3" />
      <line x1="17.3" y1="6.7" x2="19.1" y2="4.9" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();

  // a post page belongs to WORK, so the underline stays there
  const isActive = (path) =>
    pathname === path || (path === '/work' && pathname.startsWith('/posts/'));

  return (
    <nav className="site-nav" aria-label="Main">
      <div className="site-nav-bar">
        <Link
          to="/"
          className="wordmark"
          onClick={() => {
            setOpen(false);
            // already home → the landing listens and resets its chat session
            if (pathname === '/') window.dispatchEvent(new Event('jhl:home'));
          }}
        >
          JHL<span className="dot">.</span>
          <span className="home">ask me anything</span>
        </Link>

        <div className="site-nav-right">
          <ul className="nav-links">
            {NAV.map(({ label, path }) => (
              <li key={path}>
                <Link to={path} className={`nav-link${isActive(path) ? ' active' : ''}`}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="theme-toggle"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          </button>

          <button
            type="button"
            className={`nav-burger${open ? ' open' : ''}`}
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      <div className={`nav-drawer${open ? ' open' : ''}`}>
        <ul>
          {NAV.map(({ label, path }) => (
            <li key={path}>
              <Link
                to={path}
                className={`drawer-link${isActive(path) ? ' active' : ''}`}
                onClick={() => setOpen(false)}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

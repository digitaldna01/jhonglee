import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const NAV = [
  { label: 'CV', path: '/cv' },
  { label: 'PROJECTS', path: '/projects' },
  { label: 'BLOG', path: '/blog' },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <nav className="fixed top-0 z-50 w-full bg-white font-sans" aria-label="Main">
        {/* Top bar */}
        <div className="relative flex items-center h-[60px] w-full px-[var(--layout-margin)]">
          {/* Logo */}
          <Link
            to="/"
            className="text-[length:var(--body-lg)] font-bold tracking-[0.15em] no-underline text-black-1 hover:text-secondary transition-colors duration-300"
            onClick={() => setOpen(false)}
          >
            JAY
          </Link>

          {/* Desktop links — centered absolutely */}
          <ul className="hidden md:flex absolute left-1/2 -translate-x-1/2 gap-8 list-none m-0 p-0">
            {NAV.map(({ label, path }) => (
              <li key={path}>
                <Link
                  to={path}
                  className={`text-[length:var(--body-md)] no-underline tracking-[0.05em] transition-colors duration-300 ${
                    isActive(path)
                      ? 'text-secondary-dark font-semibold'
                      : 'text-black-2 hover:text-secondary-light'
                  }`}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>

          {/* Hamburger — mobile only */}
          <button
            className="md:hidden ml-auto flex flex-col justify-between w-6 h-[17px] bg-transparent border-0 rounded-none p-0 cursor-pointer"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            <span
              className={`block h-[2px] w-full bg-black-2 transition-all duration-[250ms] origin-center ${
                open ? 'translate-y-[7.5px] rotate-45' : ''
              }`}
            />
            <span
              className={`block h-[2px] w-full bg-black-2 transition-all duration-[250ms] ${
                open ? 'opacity-0' : ''
              }`}
            />
            <span
              className={`block h-[2px] w-full bg-black-2 transition-all duration-[250ms] origin-center ${
                open ? '-translate-y-[7.5px] -rotate-45' : ''
              }`}
            />
          </button>
        </div>

        {/* Mobile dropdown */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-[250ms] ${
            open ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
          }`}
          style={{ transitionTimingFunction: 'cubic-bezier(0.22,0.61,0.36,1)' }}
        >
          <ul className="flex flex-col list-none m-0 p-0 bg-white border-t border-black-5 py-1">
            {NAV.map(({ label, path }) => (
              <li key={path}>
                <Link
                  to={path}
                  className={`flex items-center gap-2 px-[var(--layout-margin)] py-[10px] text-[11px] font-semibold tracking-[0.12em] uppercase no-underline transition-colors duration-200 ${
                    isActive(path)
                      ? 'text-secondary-dark'
                      : 'text-black-3 hover:text-black-1'
                  }`}
                  onClick={() => setOpen(false)}
                >
                  {isActive(path) && (
                    <span className="w-1 h-1 rounded-full bg-secondary-dark flex-shrink-0" />
                  )}
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

    </>
  );
}

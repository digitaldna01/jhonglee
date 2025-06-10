// src/components/Navbar.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";

// Import CSS
import "../styles/navbar.css";
import "../index.css";
import "bootstrap/dist/css/bootstrap.min.css";
// Import Bootstrap JavaScript
import "bootstrap/dist/js/bootstrap.bundle.min.js";

function Navbar() {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const currentCategory = queryParams.get("category") || "ALL";

  // Function to check if the link is active
  const isActive = (path) => location.pathname === path;

  return (
    <>
      <nav className="navbar navbar-expand-lg fixed-top">
        <div className="container-fluid d-flex flex-wrap">
          <div className="col-12 d-flex justify-content-between align-items-center">
            <Link
              to="/"
              className={`nav-link navbar-component ${
                isActive("/") ? "active" : ""
              }`}
            >
              JAY
            </Link>

            {/* <a className='navbar-brand navbar-component' style={{ fontSize: 'var(--txt-md)' }}>JAY</a> */}
            <button
              className="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#navbarText"
              aria-controls="navbarText"
              aria-expanded="false"
              aria-label="Toggle navigation"
            >
              <span className="navbar-toggler-icon"></span>
            </button>
            <div
              className="collapse navbar-collapse justify-content-center"
              id="navbarText"
            >
              <ul className="navbar-nav">
                <li className="nav-item" id="navbar-active">
                  <Link
                    to="/cv"
                    id="navbarItem"
                    className={`nav-link navbar-component ${
                      isActive("/cv") ? "active" : ""
                    }`}
                  >
                    CV
                  </Link>
                </li>
                <li className="nav-item">
                  <Link
                    to="/projects"
                    id="navbarItem"
                    className={`nav-link navbar-component ${
                      isActive("/projects") ? "active" : ""
                    }`}
                  >
                    PROJECTS
                  </Link>
                </li>
                <li className="nav-item">
                  <Link
                    to="/blog"
                    id="navbarItem"
                    className={`nav-link navbar-component ${
                      isActive("/blog") ? "active" : ""
                    }`}
                  >
                    BLOG
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          {/* ✅ Blog Category Navbar (Only Shows When on `/blog`) */}
          {isActive("/blog") && (
            <div className="col-12 d-flex blog-category-container">
              <ul className="navbar-nav blog-categories flex-row justify-content-center">
                {["BLOG", "PROJECTS", "GALLERY", "MUSIC"].map((cat) => (
                  <li className="nav-item" key={cat}>
                    <Link
                      to={`/blog?category=${cat}`}
                      id="navbarItem"
                      className={`nav-link blog-category-link ${
                        currentCategory === cat ? "active" : ""
                      }`}
                    >
                      {cat}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </nav>
    </>
  );
}

export default Navbar;

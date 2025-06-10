import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

//  import Data from the JSON file
import blogData from "../data/posts.json";

import "../styles/projects.css";
import "../index.css";

import "bootstrap/dist/css/bootstrap.min.css";
// Import Bootstrap JavaScript
import "bootstrap/dist/js/bootstrap.bundle.min.js";

function Projects() {
  // updating part  start =========================================================================
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const navigate = useNavigate();

  const logicalPositions = [
    {
      top: "5%",
      left: "-5%",
      image: "images/project/brain/brain-logical-1.png",
    },
    {
      top: "25%",
      left: "-5%",
      image: "images/project/brain/brain-logical-2.png",
    },
    {
      top: "45%",
      left: "-5%",
      image: "images/project/brain/brain-logical-3.png",
    },
    {
      top: "55%",
      left: "-5%",
      image: "images/project/brain/brain-logical-4.png",
    },
  ];

  const visualPositions = [
    {
      top: "5%",
      left: "75%",
      image: "images/project/brain/brain-visual-1.png",
    },
    {
      top: "25%",
      left: "75%",
      image: "images/project/brain/brain-visual-2.png",
    },
    {
      top: "45%",
      left: "75%",
      image: "images/project/brain/brain-visual-3.png",
    },
    {
      top: "55%",
      left: "75%",
      image: "images/project/brain/brain-visual-4.png",
    },
  ];

  useEffect(() => {
    const visual = blogData
      .filter(
        (post) => post.category === "PROJECTS" && post.subcategory === "visual"
      )
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 4)
      .map((project, idx) => ({
        ...project,
        position: {
          top: visualPositions[idx].top,
          left: visualPositions[idx].left,
        },
        image: visualPositions[idx].image,
      }));

    const logical = blogData
      .filter(
        (post) => post.category === "PROJECTS" && post.subcategory === "logical"
      )
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 4)
      .map((project, idx) => ({
        ...project,
        position: {
          top: logicalPositions[idx].top,
          left: logicalPositions[idx].left,
        },
        image: logicalPositions[idx].image,
      }));

    setProjects([...logical, ...visual]);
  }, []);

  // updating part end      =========================================================================

  return (
    <>
      <section className="full-width">
        <div className="container projects-top-spacing">
          {/* <div className='row justify-content-center'>
                        <div className='col-12 col-lg-10'> */}
          <h1 className="projects-title text-center">Projects</h1>
          <div className="project-section">
            {/* Brain Image */}
            <img
              src={
                activeProject
                  ? activeProject.image
                  : "images/project/brain/default-brain.png"
              }
              className="brain-image"
              alt="Brain"
            />

            {/* Project Description (Appears Only when Hovering ) */}
            {activeProject && (
              <div
                className="project-template"
                style={{
                  top: activeProject.position.top,
                  left: activeProject.position.left,
                }}
              >
                <h2
                  className={`project-title ${
                    activeProject.subcategory === "visual"
                      ? "art-title"
                      : "cs-title"
                  }`}
                >
                  {activeProject.title}
                </h2>
                <p className="project-date">{activeProject.date}</p>
                <img
                  src={activeProject.thumbnail}
                  alt={activeProject.title}
                  className="project-image"
                />
                <p className="project-description">{activeProject.excerpt}</p>
              </div>
            )}
            {/* Invisible Hover Areas */}
            {projects.map((project, index) => (
              <div
                key={index}
                className={`hover-triangle hover-${index + 1}`}
                onMouseEnter={() => setActiveProject(project)}
                onMouseLeave={() => setActiveProject(null)}
                onClick={() => {
                  navigate(`/posts/${project.slug}`);
                }}
                style={{ cursor: "pointer" }} // Show hand cursor
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default Projects;

import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
// Data import
import blogData from "../data/posts.json";

import "../styles/projects.css";
import "../index.css";

import "bootstrap/dist/css/bootstrap.min.css";
// Import Bootstrap JavaScript
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import Footer from "../components/Footer";

function Projects() {
  const [activeProject, setActiveProject] = useState(null);
  const [showLinkOptions, setShowLinkOptions] = useState(false);
  const [linkPosition, setLinkPosition] = useState({ top: 0, left: 0 });

  const projectData = {
    CS1: {
      category: "logical",
      image: "images/project/brain-CS1.png",
      thumbnail: "images/project/thumbnail-CS1.svg",
      title: "Quantum Computing",
      date: "August 2024",
      description:
        "The purpose of this project is to create a quantum simulator using Google's Tensor Network framework.",
      Links: [
        { label: "Demo" },
        {
          label: "Code",
          url: "https://github.com/digitaldna01/quantum-simulator",
        },
      ],
      position: { top: "5%", left: "-5%" },
    },
    CS2: {
      category: "logical",
      image: "images/project/brain-CS2.png",
      thumbnail: "images/project/thumbnail-CS2.svg",
      title: "Hand Pose Estimation",
      date: "April 2024",
      description:
        "The purpose of this project is to create a quantum simulator using Google's Tensor Network framework.",
      detailsLink: "https://www.mdpi.com/2079-9292/13/10/1970",
      position: { top: "25%", left: "-5%" },
    },
    CS3: {
      category: "logical",
      image: "images/project/brain-CS3.png",
      thumbnail: "images/project/thumbnail-CS1.svg",
      title: "AI Research",
      date: "August 2024",
      description:
        "The purpose of this project is to create a quantum simulator using Google's Tensor Network framework.",
      detailsLink: "https://www.mdpi.com/2079-9292/13/10/1970",
      position: { top: "45%", left: "-5%" },
    },
    CS4: {
      category: "logical",
      image: "images/project/brain-CS4.png",
      thumbnail: "images/project/thumbnail-CS1.svg",
      title: "Cybersecurity",
      date: "August 2024",
      description:
        "The purpose of this project is to create a quantum simulator using Google's Tensor Network framework.",
      detailsLink: "https://www.mdpi.com/2079-9292/13/10/1970",
      position: { top: "55%", left: "-5%" },
    },

    Art1: {
      category: "Visual",
      image: "images/project/brain-ART1.png",
      thumbnail: "images/project/thumbnail-Art1.svg",
      title: "Cogs and Gears",
      date: "March 2025",
      description:
        "The purpose of this project is to create a quantum simulator using Google's Tensor Network framework.",
      detailsLink: "https://digitaldna01.github.io/digital-narrative/",
      position: { top: "5%", left: "75%" },
    },
    Art2: {
      category: "Visual",
      image: "images/project/brain-Art2.png",
      thumbnail: "images/project/thumbnail-Art2.svg",
      title: "Visual Art Portfolio",
      date: "August 2023",
      description:
        "The purpose of this project is to create a quantum simulator using Google's Tensor Network framework.",
      position: { top: "25%", left: "75%" },
    },
    Art3: {
      category: "Visual",
      image: "images/project/brain-ART3.png",
      thumbnail: "images/project/thumbnail-Art3.svg",
      title: "Gill Sans",
      date: "August 2024",
      description:
        "The purpose of this project is to create a quantum simulator using Google's Tensor Network framework.",
      detailsLink: "https://www.mdpi.com/2079-9292/13/10/1970",
      position: { top: "45%", left: "75%" },
    },
    Art4: {
      category: "Visual",
      image: "images/project/brain-ART4.png",
      thumbnail: "images/project/thumbnail-Art4.svg",
      title: "Design Study",
      date: "August 2024",
      description:
        "The purpose of this project is to create a quantum simulator using Google's Tensor Network framework.",
      detailsLink: "https://www.mdpi.com/2079-9292/13/10/1970",
      position: { top: "55%", left: "75%" },
    },
  };

  const handleMouseEnter = (projectKey) => {
    setActiveProject(projectKey);
  };

  const handleMouseLeave = () => {
    setActiveProject(null);
  };

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
                  ? projectData[activeProject].image
                  : "images/project/default-brain.png"
              }
              className="brain-image"
              alt="Brain"
            />

            {/* Project Description (Appears Only when Hovering ) */}
            {activeProject && (
              <div
                className="project-template"
                style={{
                  top: projectData[activeProject].position.top,
                  left: projectData[activeProject].position.left,
                }}
              >
                <h2
                  className={`project-title ${
                    projectData[activeProject].category === "Visual"
                      ? "art-title"
                      : "cs-title"
                  }`}
                >
                  {projectData[activeProject].title}
                </h2>
                <p className="project-date">
                  {projectData[activeProject].date}
                </p>
                <img
                  src={projectData[activeProject].thumbnail}
                  alt={projectData[activeProject].title}
                  className="project-image"
                />
                <p className="project-description">
                  {projectData[activeProject].description}
                </p>
              </div>
            )}
            {/* Invisible Hover Areas */}
            {Object.keys(projectData).map((key, index) => (
              <div
                key={key}
                className={`hover-triangle hover-${index + 1}`}
                onMouseEnter={() => setActiveProject(key)}
                onMouseLeave={() => setActiveProject(null)}
                onClick={(e) => {
                  const links = projectData[key].Links;
                  if (!links || links.length === 0) return; // No link to open

                  const rect = e.target.getBoundingClientRect();
                  setLinkPosition({
                    top: rect.top + window.scrollY,
                    left: rect.left + window.scrollX,
                  });
                  setActiveProject(key);
                  setShowLinkOptions(true);
                  e.stopPropagation(); // Prevent triggering the parent click event
                  // if (projectData[key].detailsLink) {
                  //     window.open(projectData[key].detailsLink, "_blank");
                  // }
                }}
                style={{ cursor: "pointer" }} // Show hand cursor
              />
            ))}
            {/* <div className="hover-zone left" onMouseEnter={() => handleMouseEnter('CS1')} onMouseLeave={handleMouseLeave} />
                                <div className="hover-zone right" onMouseEnter={() => handleMouseEnter('Art1')} onMouseLeave={handleMouseLeave} /> */}
          </div>
          {showLinkOptions && activeProject && (
            <div
              className="link-popup"
              style={{
                position: "absolute",
                top: linkPosition.top,
                left: linkPosition.left,
                background: "white",
                border: "1px solid #ccc",
                padding: "10px",
                zIndex: 999,
                borderRadius: "8px",
              }}
            >
              {projectData[activeProject].Links.map((linkItem, index) => (
                <div
                  key={index}
                  className="popup-item"
                  style={{ cursor: "pointer", marginBottom: "5px" }}
                  onClick={() => window.open(linkItem.url, "_blank")}
                >
                  {linkItem.label}
                </div>
              ))}
            </div>
          )}
          {/* </div>
                    </div> */}
        </div>

        <Footer />
      </section>
    </>
  );
}

export default Projects;

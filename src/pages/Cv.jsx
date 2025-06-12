import React from "react";

// Import CSS

import "bootstrap/dist/css/bootstrap.min.css";
// Import Bootstrap JavaScript
import "bootstrap/dist/js/bootstrap.bundle.min.js";

import "../styles/cv.css"; // CSS 파일을 import 합니다
import "../index.css";

// import data from JSON files
import cvData from "../data/cv.json";

function Cv() {
  // Extract data from cvData
  const educationData = cvData.education;
  const experienceData = cvData.experience;
  const publicationData = cvData.publication;
  const projectData = cvData.project;

  return (
    <>
      <section id="cv" className="">
        <div className="container cv-top-spacing">
          <div className="row justify-content-center">
            <div className="col-12 col-lg-10">
              <h1 className="cv-title text-center">Jae Hong Lee | 이재홍</h1>
              <div className="box-5"></div>
              <div className="cv-introduction">
                <p className="cv-subtitle">Engineer, Designer, Researcher </p>
                <p className="cv-text">
                  My name is Jae Hong Lee. I am a Computer Science Major with a
                  Visual Arts Minor at Boston University. I specialize in
                  merging technical and creative disciplines to develop
                  interactive digital experiences that are both functional and
                  visually compelling. <br /> My background spans Algorithm
                  design, AI & Machine Learning, and Quantum Computing,
                  complemented by string skills in visual design and creative
                  tools. I specialize in algorithmic analysis and optimization,
                  with a strong focus on data-driven solutions using advanced
                  frameworks like TensorFlow and PyTorch. My approach combines
                  technical expertise with artistic principles to enhance user
                  experience and digital media.{" "}
                </p>
                <div className="box-4"></div>
                <div className="cv-contact">
                  <a href="public/pdf/Jae_Hong_Lee_Resume.pdf" target="_blank">
                    CV
                  </a>
                  <a href="mailto:ll.leejaehong@gmail.com" target="_blank">
                    Email
                  </a>
                  <a
                    href="https://www.linkedin.com/in/hong-lee-0821/"
                    target="_blank"
                  >
                    LinkedIn
                  </a>
                  <a href="https://github.com/digitaldna01" target="_blank">
                    GitHub
                  </a>
                  <a href="https://www.instagram.com//" target="_blank">
                    Instagram
                  </a>
                </div>
              </div>
              <div className="box-4"></div>
              <div className="cv-education">
                <h2 className="cv-subtitle education-title">Education</h2>
                {educationData.map((item, index) => (
                  <div key={index} className="cv-education-item">
                    <p className="cv-list-date">{item.date}</p>
                    <div className="cv-list-item">
                      {item.link ? (
                        <a
                          href={item.link}
                          className="cv-list-dot cv-list-dot-link"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          •
                        </a>
                      ) : (
                        <span className="cv-list-dot">•</span>
                      )}
                      <p
                        className={`cv-list-text ${
                          item.link ? "clickable" : ""
                        }`}
                        onClick={() =>
                          item.link && window.open(item.link, "_blank")
                        }
                        style={
                          item.link
                            ? {
                                cursor: "pointer",
                                color: "blue",
                                textDecoration: "underline",
                              }
                            : {}
                        }
                      >
                        {item.degree}
                      </p>
                      {/* <p className="cv-list-text">{item.degree}</p> */}
                    </div>
                  </div>
                ))}
              </div>
              <div className="box-4"></div>
              <div className="cv-experience">
                <h2 className="cv-subtitle education-title">Experience</h2>
                {experienceData.map((item, index) => (
                  <div key={index} className="cv-education-item">
                    <p className="cv-list-date">{item.date}</p>
                    <div className="cv-list-item">
                      {item.link ? (
                        <a
                          href={item.link}
                          className="cv-list-dot cv-list-dot-link"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          •
                        </a>
                      ) : (
                        <span className="cv-list-dot">•</span>
                      )}
                      <p
                        className={`cv-list-text ${
                          item.link ? "clickable" : ""
                        }`}
                        onClick={() =>
                          item.link && window.open(item.link, "_blank")
                        }
                        style={
                          item.link
                            ? {
                                cursor: "pointer",
                                color: "blue",
                                textDecoration: "underline",
                              }
                            : {}
                        }
                      >
                        {item.degree}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="box-4"></div>
              <div className="cv-publication">
                <h2 className="cv-subtitle education-title">Publication</h2>
                {publicationData.map((item, index) => (
                  <div key={index} className="cv-education-item">
                    <p className="cv-list-date">{item.date}</p>
                    <div className="cv-list-item">
                      {item.link ? (
                        <a
                          href={item.link}
                          className="cv-list-dot cv-list-dot-link"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          •
                        </a>
                      ) : (
                        <span className="cv-list-dot">•</span>
                      )}
                      <p
                        className={`cv-list-text ${
                          item.link ? "clickable" : ""
                        }`}
                        onClick={() =>
                          item.link && window.open(item.link, "_blank")
                        }
                        style={
                          item.link
                            ? {
                                cursor: "pointer",
                                color: "blue",
                                textDecoration: "underline",
                              }
                            : {}
                        }
                      >
                        {item.degree}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="box-4"></div>
              <div className="cv-project">
                <h2 className="cv-subtitle education-title">Project</h2>
                {projectData.map((item, index) => (
                  <div key={index} className="cv-education-item">
                    <p className="cv-list-date">{item.date}</p>
                    <div className="cv-list-item">
                      {item.link ? (
                        <a
                          href={item.link}
                          className="cv-list-dot cv-list-dot-link"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          •
                        </a>
                      ) : (
                        <span className="cv-list-dot">•</span>
                      )}
                      <p
                        className={`cv-list-text ${
                          item.link ? "clickable" : ""
                        }`}
                        onClick={() =>
                          item.link && window.open(item.link, "_blank")
                        }
                        style={
                          item.link
                            ? {
                                cursor: "pointer",
                                color: "blue",
                                textDecoration: "underline",
                              }
                            : {}
                        }
                      >
                        {item.degree}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default Cv;

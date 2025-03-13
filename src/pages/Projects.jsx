import React, {useState} from 'react';
import { Link, useLocation } from 'react-router-dom';

import './css/projects.css';
import './../index.css';

import 'bootstrap/dist/css/bootstrap.min.css'
// Import Bootstrap JavaScript
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import Footer from './components/Footer';

function Projects() {
    const [activeProject, setActiveProject] = useState(null);

    const projectData = {
        "CS1": { image: "images/project/brain-CS1.png", description: "Quantum Computing", position: { top: "30%", left: "15%" } },
        "CS2": { image: "images/project/brain-CS2.png", description: "Machine Learning", position: { top: "35%", left: "17%" } },
        "CS3": { image: "images/project/brain-CS3.png", description: "AI Research", position: { top: "45%", left: "18%" } },
        "CS4": { image: "images/project/brain-CS4.png", description: "Cybersecurity", position: { top: "50%", left: "20%" } },
        "Art1": { image: "images/project/brain-ART1.png", description: "Visual Art Portfolio", position: { top: "30%", left: "70%" } },
        "Art2": { image: "images/project/brain-Art2.png", description: "Graphic Design", position: { top: "35%", left: "75%" } },
        "Art3": { image: "images/project/brain-ART3.png", description: "Photography", position: { top: "45%", left: "78%" } },
        "Art4": { image: "images/project/brain-ART4.png", description: "UI/UX Research", position: { top: "50%", left: "80%" } }
    };

    const handleMouseEnter = (projectKey) => {
        setActiveProject(projectKey);
    };


    const handleMouseLeave = () => {
        setActiveProject(null);
    };

    return(
        <>
            <section className='full-width'>
                <div className='container projects-top-spacing'>
                    {/* <div className='row justify-content-center'>
                        <div className='col-12 col-lg-10'> */}
                            <h1 className='projects-title text-center'>Projects</h1>
                            <div className='project-section'>
                                {/* Brain Image */}
                                <img
                                    src={activeProject ? projectData[activeProject].image : "images/project/default-brain.png"}
                                    className='brain-image'
                                    alt="Brain"
                                />

                                {/* Project Description (Appears Only when Hovering ) */}
                                {activeProject && (
                                    <div
                                        className='project-description'
                                        style={{
                                            top: projectData[activeProject].position.top,
                                            left: projectData[activeProject].position.left
                                        }}
                                    >
                                        <h2>{projectData[activeProject].description}</h2>
                                        <p>Project Detail go here...</p>
                                    </div>
                                )}
                                {/* Invisible Hover Areas */}
                                {Object.keys(projectData).map((key, index) => (
                                    <div
                                        key={key}
                                        className={`hover-triangle hover-${index + 1}`}
                                        onMouseEnter={() => setActiveProject(key)}
                                        onMouseLeave={() => setActiveProject(null)}
                                    />
                                ))}
                                {/* <div className="hover-zone left" onMouseEnter={() => handleMouseEnter('CS1')} onMouseLeave={handleMouseLeave} />
                                <div className="hover-zone right" onMouseEnter={() => handleMouseEnter('Art1')} onMouseLeave={handleMouseLeave} /> */}
                            </div>
                        {/* </div>
                    </div> */}

                </div>
                
                <Footer />
            </section>
        </>

    )
}

export default Projects
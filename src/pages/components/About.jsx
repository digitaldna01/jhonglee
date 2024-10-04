// src/components/Navbar.jsx
import React, { useEffect } from 'react';

import '../css/about.css';
import '../../index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
// Import Bootstrap JavaScript
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

import WOW from 'wowjs';
import 'animate.css';

function About(){
    useEffect(() => {
        // Initialize WOW.js when the component mounts
        new WOW.WOW().init();
    }, []);

    return(
        <section id="about">
            <div className='container'>
                <div className='row'>
                    <div className='col-md-6 col-sm-6'>
                        <div className='block wow fadeInLeft' data-wow-delay=".3s" data-wow-duration="500ms">
                            <h2>About Me</h2>
                            <p>
                            My name is Jae Hong Lee. I am a Computer Science Major with a Visual Arts Minor at Boston University. I specialize in merging technical and creative disciplines to develop interactive digital experiences that are both functional and visually compelling.
                            </p>
                            <p>
                            My background spans Algorithm design, AI & Machine Learning, and Quantum Computing, complemented by string skills in visual design and creative tools. I specialize in algorithmic analysis and optimization, with a strong focus on data-driven solutions using advanced frameworks like TensorFlow and PyTorch. My approach combines technical expertise with artistic principles to enhance user experience and digital media. 
                            </p>
                        </div>
                    </div>
                    
                    <div className='col-md-6 col-sm-6'>
                        <div className='block wow fadeInRight' data-wow-delay=".3s" data-wow-duration="500ms">
                            <img src="images/about.png" alt="" />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

export default About
import React, { useEffect, useRef } from 'react';


import '../css/slider.css'; 
import '../../index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
// Import Bootstrap JavaScript
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

import WOW from 'wowjs';
import 'animate.css';
import 'hover.css';

function Slider(){
    const words = ['ENGINEER', 'DESIGNER', 'RESEARCHER'];
    const [currentWordIndex, setCurrentWordIndex] = React.useState(0);
    const headlineRef = useRef(null);

    useEffect(() => {
        // Initialize WOW.js when the component mounts
        new WOW.WOW().init();
        const interval = setInterval(() => {
            setCurrentWordIndex((prevIndex) => (prevIndex + 1) % words.length);
        }, 3000); // Change word every 3 seconds

        return () => clearInterval(interval); // Clean up interval on component unmount
    }, []);

    return(
        <div className='no-js'>
            <section id='slider-area'>
                <div className='container'>
                    <div className='row'>
                        <div className='col-md-12 text-center'>
                            <div className='block wow fadeInup' data-wow-delay=".3s">

                                <section className='cd-intro'>
                                    <h1 className='wow fadeInUp animated cd-headline slide' data-wow-delay=".4s">
                                        <span>HI, MY NAME IS Jay  &amp; I AM A</span><br/>
                                        <span className='cd-words-wrapper'>
                                            <b className={currentWordIndex === 0 ? 'is-visible' : ''}>{words[0]}</b>
                                            <b className={currentWordIndex === 1 ? 'is-visible' : ''}>{words[1]}</b>
                                            <b className={currentWordIndex === 2 ? 'is-visible' : ''}>{words[2]}</b>
                                        </span>
                                    </h1>
                                </section>

                                <h2 className='wow fadeInUp animated' data-wow-delay=".6s">
                                    I am a student at Boston University studying Computer Science and Visual Arts. <br/>I am a Engineer, Designer, and Researcher. This site showcase some of my work
                                </h2>

                                <a className='wow fadeInUp animated btn btn-lines hvr-bounce-to-right' data-wow-delay=".9s" href="pdf/Jae_Hong_Lee_Resume.pdf" target="_blank">
                                    Discover Resume
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )

}

export default Slider
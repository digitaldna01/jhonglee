import React from 'react';

// Import CSS
import './css/info.css';
import './../index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
// Import Bootstrap JavaScript
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

import Slider from './components/Slider.jsx';
import About from './components/About.jsx';
import Portfolio from './components/Portfolio.jsx';

function Info(){
    return(
        <>
            <Slider/>
            <About/>
            <Portfolio/>
        </>
    );
}
export default Info;
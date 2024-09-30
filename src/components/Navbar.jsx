// src/components/Navbar.jsx
import React from 'react';
// Import CSS
import './css/navbar.css'
import './../index.css'
import 'bootstrap/dist/css/bootstrap.min.css'
// Import Bootstrap JavaScript
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

function Navbar(){
    return(
        <nav className='navbar navbar-expand-lg fixed-top'>
            <div className='container-fluid'>
                <a className='navbar-brand navbar-component' style={{ fontSize: 'var(--txt-md)' }}>JAY</a>
                <button className='navbar-toggler' type='button' data-bs-toggle='collapse' data-bs-target="#navbarText" aria-controls="navbarText" aria-expanded="false" aria-label="Toggle navigation">
                    <span class="navbar-toggler-icon"></span>
                </button>
                <div className='collapse navbar-collapse justify-content-center' id="navbarText">
                    <ul className="navbar-nav">
                        <li className="nav-item">
                          <a className="nav-link navbar-component" href="/">INFO</a>
                        </li>
                        <li className="nav-item">
                          <a className="nav-link navbar-component" href="">PROJECTS</a>
                        </li>
                        <li className="nav-item">
                          <a className="nav-link navbar-component" href="">CONTACT</a>
                        </li>
                    </ul>
                </div>
            </div> 
        </nav>
    ) 
}

export default Navbar;
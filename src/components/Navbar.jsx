// src/components/Navbar.jsx
import React from 'react';
// Import CSS
import './navbar.css'
import './../index.css'
import 'bootstrap/dist/css/bootstrap.min.css'
// Import Bootstrap JavaScript
import 'bootstrap/dist/js/bootstrap.bundle.min.js'

function Navbar(){
    return(
        <nav className='navbar navbar-expand-lg fixed-top'>
            <div className='container-fluid'>
                <a className='navbar-brand navbar-component'>Jay</a>
            </div>
        </nav>
    ) 
}

export default Navbar;
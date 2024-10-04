import { useState } from 'react'
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from 'react-router-dom';
import './App.css'

import Navbar from './pages/Navbar';
import Info from './pages/Info';
import Projects from './pages/Projects';
import Contact from './pages/Contact';


function App() {

  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<Info />}/>
        <Route path='/projects' element={<Projects/>}/>
        <Route path='/contact' element={<Contact />}/>
      </Routes>
    </Router>
  );
}

export default App

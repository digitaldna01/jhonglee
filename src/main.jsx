import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Import  JavaScript
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import App from './App.jsx'

// Import CSS
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css'


const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

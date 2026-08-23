import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';

import Navbar from './layout/Navbar';
import Footer from './layout/Footer';

import Info from './pages/Info';
import Blog from './pages/Blog';
import Cv from './pages/Cv';
import Post from './pages/Post';

function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<Info />} />
        <Route path="/cv" element={<Cv />} />
        <Route path="/work" element={<Blog />} />
        <Route path="/blog" element={<Navigate to="/work" replace />} />
        <Route path="/posts/:slug" element={<Post />} />
      </Routes>
      <Footer />
    </Router>
  );
}

export default App;

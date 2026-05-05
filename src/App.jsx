import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import Navbar from './layout/Navbar';
import Footer from './layout/Footer';

import Info from './pages/Info';
import Projects from './pages/Projects';
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
        <Route path="/projects" element={<Projects />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/posts/:slug" element={<Post />} />
      </Routes>
      <Footer />
    </Router>
  );
}

export default App;

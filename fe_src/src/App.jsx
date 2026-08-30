import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import Navbar from './layout/Navbar';
import Footer from './layout/Footer';

import Info from './pages/Info';
import Work from './pages/Work';
import Cv from './pages/Cv';
import Post from './pages/Post';
import NotFound from './pages/NotFound';

function Layout() {
  // the landing is a fixed full-viewport page — a flow footer would
  // surface right under the navbar there
  const isLanding = useLocation().pathname === '/';
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Info />} />
        <Route path="/cv" element={<Cv />} />
        <Route path="/work" element={<Work />} />
        <Route path="/blog" element={<Navigate to="/work" replace />} />
        <Route path="/posts/:slug" element={<Post />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {!isLanding && <Footer />}
    </>
  );
}

function App() {
  return (
    <Router>
      <Layout />
    </Router>
  );
}

export default App;

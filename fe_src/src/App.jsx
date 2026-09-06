import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import Navbar from './layout/Navbar';
import Footer from './layout/Footer';

import Info from './pages/Info';
import Work from './pages/Work';
import Cv from './pages/Cv';
import Post from './pages/Post';
import NotFound from './pages/NotFound';
import Admin from './pages/Admin';

function Layout() {
  // the landing is a fixed full-viewport page — a flow footer would
  // surface right under the navbar there
  const { pathname } = useLocation();
  const isLanding = pathname === '/' || pathname.startsWith('/chat/');
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Info />} />
        <Route path="/chat/:sid" element={<Info />} />
        <Route path="/cv" element={<Cv />} />
        <Route path="/work" element={<Work />} />
        <Route path="/blog" element={<Navigate to="/work" replace />} />
        {/* renamed 2026-09-05: the paper is about pose generation, not estimation */}
        <Route path="/posts/handPoseEstimation" element={<Navigate to="/posts/handPoseGeneration" replace />} />
        <Route path="/posts/:slug" element={<Post />} />
        <Route path="/admin" element={<Admin />} />
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

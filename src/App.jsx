import { useState } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Link,
  useLocation,
} from "react-router-dom";
import "./App.css";

import Navbar from "./pages/Navbar";
import Info from "./pages/Info";
import Projects from "./pages/Projects";
import Blog from "./pages/Blog";
import Cv from "./pages/Cv";
import Post from "./pages/Post";
import Footer from "./components/Footer";

function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<Info />} />
        <Route path="/cv" element={<Cv />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/posts/:slug" element={<Post />} /> {/* ✅ 이 줄만 추가 */}
      </Routes>
      <Footer />
    </Router>
  );
}

export default App;

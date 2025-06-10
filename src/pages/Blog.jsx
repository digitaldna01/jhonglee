import { useState, useEffect } from "react";
import blogData from "../data/posts.json";
import { Link } from "react-router-dom";

import "../styles/blog.css";

function Blog() {
  const [blogPosts, setBlogPosts] = useState([]);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    setBlogPosts(blogData); // Load posts from JSON
  }, []);

  const filteredPosts =
    filter === "ALL"
      ? blogPosts
      : blogPosts.filter((post) => post.category === filter);

  return (
    // Infinite Scroll style
    <>
      <section>
        <div className="filter-buttons">
          {["ALL", "BLOG", "PROJECTS", "GALLERY", "MUSIC"].map((category) => (
            <button
              key={category}
              className={filter === category ? "active" : ""}
              onClick={() => setFilter(category)}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="blog-posts blog-top-spacing">
          {filteredPosts.map((post) => (
            <div key={post.id} className="blog-card">
              <h2>{post.title}</h2>
              <p>
                <i>{post.date}</i>
              </p>
              <p>{post.excerpt}</p>
              <Link to={`/posts/${post.slug}`}>Read More</Link>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default Blog;

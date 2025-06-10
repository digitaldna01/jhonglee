import { useState, useEffect } from "react";
import blogData from "../data/posts.json";
import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";

import "bootstrap/dist/css/bootstrap.min.css";
// Import Bootstrap JavaScript
import "bootstrap/dist/js/bootstrap.bundle.min.js";

import "../styles/blog.css";
import "../index.css";

function Blog() {
  const [blogPosts, setBlogPosts] = useState([]);
  const location = useLocation();

  // Get category from query
  const queryParams = new URLSearchParams(location.search);
  const categoryQuery = queryParams.get("category") || "ALL";

  useEffect(() => {
    setBlogPosts(blogData); // Load posts from JSON
  }, []);

  const filteredPosts =
    categoryQuery === "ALL"
      ? blogPosts
      : blogPosts.filter((post) => post.category === categoryQuery);

  // 최신 날짜순 정렬
  const sortedPosts = [...filteredPosts].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  return (
    // Infinite Scroll style
    <>
      <section>
        <div className="blog-container">
          {sortedPosts.map((post) => (
            <Link
              to={`/posts/${post.slug}`}
              key={post.id}
              className="blog-post-link"
            >
              <div className="blog-post">
                <div className="blog-title">{post.title}</div>
                <p className="blog-meta">
                  {post.category} | {post.date}
                </p>
                <img
                  src={post.thumbnail}
                  alt={post.title}
                  className="blog-thumbnail xl:w-full lg:w-full md:w-full sm:w-full xs:w-full"
                />
                <p>{post.excerpt}</p>
                <p>{post.keywords}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

export default Blog;

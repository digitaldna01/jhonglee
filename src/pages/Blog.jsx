import { useState, useEffect } from "react";
import blogData from "../data/posts.json";
import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";

import "../styles/blog.css";

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
                <p>{post.excerpt}</p>
                <p>{post.keywords}</p>
                {/* <Link to={`/posts/${post.slug}`}>Read More</Link> */}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

export default Blog;

import { useState, useEffect } from "react";
import blogData from "../data/posts.json";
import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";

import "bootstrap/dist/css/bootstrap.min.css";
// Import Bootstrap JavaScript
import "bootstrap/dist/js/bootstrap.bundle.min.js";

import "../styles/blog.css";
import "../index.css";
import "../styles/font.css";

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
                <p className="blog-meta mb-4">
                  {post.category} | {post.date}
                </p>
                <img
                  src={post.thumbnail}
                  alt={post.title}
                  className="blog-thumbnail text-center mb-4"
                />
                {/* {post.description.filter((d) => d.trim() !== "")} */}
                {post.description && post.description.trim() !== "" && (
                  <>
                    <p className="txt-lg font-semibold mt-4 mb-2">
                      DESCRIPTION
                    </p>
                    <p className="blog-description">{post.description}</p>
                  </>
                )}
                {/* <p className="txt-lg font-semibold">KEYWORDS</p> */}
                {post.keywords &&
                  post.keywords.filter((k) => k.trim() !== "").length > 0 && (
                    <>
                      <p className="txt-lg font-semibold mt-4 mb-2">KEYWORDS</p>
                      <div className="flex flex-wrap gap-2">
                        {post.keywords
                          .filter((k) => k.trim() !== "")
                          .map((keyword, index) => (
                            <span
                              key={index}
                              className="px-3 py-1 mx-2 rounded-3 border black-2"
                            >
                              {keyword}
                            </span>
                          ))}
                      </div>
                    </>
                  )}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

export default Blog;

import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";

import posts from "../data/posts.json";
import "../styles/blog.css";
import "../styles/post.css";

// MDX 파일을 glob으로 import
const postModules = import.meta.glob("../posts/*.mdx");

export default function Post() {
  const { slug } = useParams();
  const [PostComponent, setPostComponent] = useState(null);

  const postMeta = posts.find((p) => p.slug === slug);

  useEffect(() => {
    const path = `../posts/${slug}.mdx`;
    const loader = postModules[path];

    if (loader) {
      loader().then((mod) => {
        setPostComponent(() => mod.default);
      });
    } else {
      console.warn("Post not found:", path);
    }
  }, [slug]);

  if (!postMeta) return <p>404 - Post Not Found</p>;
  if (!PostComponent) return <p>Loading...</p>;

  return (
    <>
      <section className="post-page">
        <div className="blog-post"></div>
        <div className="blog-title">{postMeta.title}</div>
        <p className="blog-meta">
          {postMeta.category} | {postMeta.date}
        </p>

        <PostComponent />
      </section>
    </>
  );
}

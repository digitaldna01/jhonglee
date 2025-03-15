import { useState, useEffect } from "react";
import blogData from "../data/blogPosts.json";

function Blog () {
    const [blogPosts, setBlogPosts] = useState([]);

    useEffect(() => {
        setBlogPosts(blogData); // Load posts from JSON
    }, []);

    const [filter, setFilter] = useState("ALL");

    const filteredPosts = filter === "ALL"
    ? blogPosts
    : blogPosts.filter(post => post.category === filter);

    return(
        <>
            <section>
                <div className="filter-buttons">
                    {["ALL", "NEWS", "LOG", "PROJECTS", "GALLERY", "MUSIC"].map(category => (
                    <button 
                        key={category} 
                        className={filter === category ? "active" : ""}
                        onClick={() => setFilter(category)}
                    >
                    {category}
          </button>
        ))}
      </div>

      <div className="blog-posts">
        {filteredPosts.map(post => (
          <div key={post.id} className="blog-card">
            <h2>{post.title}</h2>
            <p><i>{post.date}</i></p>
            <p>{post.content}</p>
          </div>
        ))}
      </div>
            </section>
        </>
        
    )
}

export default Blog

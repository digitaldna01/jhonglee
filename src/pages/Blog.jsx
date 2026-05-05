import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import blogData from '../data/posts.json';

function Blog() {
  const [blogPosts, setBlogPosts] = useState([]);
  const location = useLocation();
  const categoryQuery = new URLSearchParams(location.search).get('category') || 'ALL';

  useEffect(() => {
    setBlogPosts(blogData);
  }, []);

  const sortedPosts = [...(
    categoryQuery === 'ALL' ? blogPosts : blogPosts.filter((p) => p.category === categoryQuery)
  )].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <section className="pt-[110px]">
      {sortedPosts.map((post) => (
        <Link
          to={`/posts/${post.slug}`}
          key={post.id}
          className="block no-underline text-inherit hover:no-underline"
        >
          <div className="max-w-3xl mx-auto mb-24 px-[var(--layout-margin)]">
            <div className="text-[length:var(--h2)] text-center transition-colors duration-500 hover:text-secondary">
              {post.title}
            </div>

            <p className="text-[length:var(--caption)] text-center font-[Helvetica] mb-4">
              {post.category} | {post.date}
            </p>

            <img
              src={post.thumbnail}
              alt={post.title}
              className="block w-full max-w-3xl h-auto object-cover rounded-xl mx-auto mb-4"
            />

            {post.description && post.description.trim() !== '' && (
              <>
                <p className="text-[length:var(--body-lg)] font-semibold mt-4 mb-2">DESCRIPTION</p>
                <p className="font-sans">{post.description}</p>
              </>
            )}

            {post.keywords && post.keywords.filter((k) => k.trim() !== '').length > 0 && (
              <>
                <p className="text-[length:var(--body-lg)] font-semibold mt-4 mb-2">KEYWORDS</p>
                <div className="flex flex-wrap gap-2">
                  {post.keywords
                    .filter((k) => k.trim() !== '')
                    .map((keyword, i) => (
                      <span key={i} className="px-3 py-1 rounded-full border border-black-2 text-black-2 text-[length:var(--body-sm)]">
                        {keyword}
                      </span>
                    ))}
                </div>
              </>
            )}
          </div>
        </Link>
      ))}
    </section>
  );
}

export default Blog;

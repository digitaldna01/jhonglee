// every post's metadata (not its body), newest first — the order WORK shows.
// Lives apart from the components so react-refresh sees pure component files.
export const ALL_POSTS = Object.entries(
  import.meta.glob('../../posts/*.mdx', { eager: true, import: 'metadata' }),
)
  .map(([path, m]) => ({ slug: path.replace('../../posts/', '').replace('.mdx', ''), ...m }))
  .filter((p) => p.title)
  .sort((a, b) => new Date(b.date) - new Date(a.date));

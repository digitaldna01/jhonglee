export default function YouTube({ id }) {
  return (
    <iframe
      width="800px"
      height="450px"
      src={`https://www.youtube.com/embed/${id}`}
      title="YouTube video"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}

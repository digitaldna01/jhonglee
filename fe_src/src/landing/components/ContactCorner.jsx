/* Stays visible in chat mode on purpose: the moment a visitor has read
   a few answers is exactly when they might want to reach out. */
export default function ContactCorner() {
  return (
    <nav className="corner" aria-label="Contact">
      <a href="mailto:ll.leejaehong.ll@gmail.com">email</a>
      <a href="https://github.com/digitaldna01" target="_blank" rel="noreferrer">
        github
      </a>
    </nav>
  );
}

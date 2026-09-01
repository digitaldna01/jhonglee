import { useLocation } from 'react-router-dom';
import BackLink from '../components/BackLink';
import cvData from '../data/cv.json';
import { pad2 } from '../utils/format';
import '../styles/cv.css';

const SECTIONS = [
  { title: 'Education', items: cvData.education },
  { title: 'Experience', items: cvData.experience },
  { title: 'Publication', items: cvData.publication },
  { title: 'Selected Projects', items: cvData.project },
];

const CONTACTS = [
  { label: 'Email', href: 'mailto:ll.leejaehong.ll@gmail.com' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/hong-lee-0821/' },
  { label: 'GitHub', href: 'https://github.com/digitaldna01' },
  { label: 'Instagram', href: 'https://www.instagram.com/8.21j' },
  { label: 'Resume', href: '/pdf/Jay_Resume.pdf' },
];

function CvRow({ item }) {
  const title = (
    <>
      <span className="mk" aria-hidden="true" />
      {item.degree}
      {item.link && <span className="arr" aria-hidden="true">↗</span>}
    </>
  );
  return (
    <div className="cv-row">
      <div className="cv-date">{item.date}</div>
      {item.link ? (
        <a className="cv-title" href={item.link} target="_blank" rel="noreferrer">
          {title}
        </a>
      ) : (
        <div className="cv-title">{title}</div>
      )}
    </div>
  );
}

export default function Cv() {
  // reached from a chat citation → the way back is that conversation (same as Post)
  const from = useLocation().state;
  const chatAddress = from?.from === 'chat' ? (from.sid ? `/chat/${from.sid}` : '/') : null;
  return (
    <main className="cv">
      {chatAddress && <BackLink to={chatAddress} inFlow>back to chat</BackLink>}
      <div className="cv-masthead">
        <p className="cv-eyebrow">Curriculum Vitae</p>
        <h1 className="cv-name">
          Jae Hong Lee <span className="ko">이재홍</span>
        </h1>
        <p className="cv-role">engineer · designer · researcher</p>
        <p className="cv-intro">
          My name is Jae Hong Lee. I am a Computer Science major with a Visual
          Arts minor at Boston University. I specialize in merging technical and
          creative disciplines to build interactive digital experiences that are
          both functional and visually compelling. My background spans algorithm
          design, AI &amp; Machine Learning, and Quantum Computing, complemented
          by strong skills in visual design and creative tools.
        </p>
        <div className="cv-contacts">
          {CONTACTS.map(({ label, href }) => (
            <a key={label} href={href} target="_blank" rel="noreferrer">
              {label}
            </a>
          ))}
        </div>
      </div>

      {SECTIONS.map(({ title, items }) => (
        <section className="cv-section" key={title}>
          <p className="cv-label">
            {title} <span className="count">{pad2(items.length)}</span>
          </p>
          {items.map((item) => (
            <CvRow key={item.degree} item={item} />
          ))}
        </section>
      ))}
    </main>
  );
}

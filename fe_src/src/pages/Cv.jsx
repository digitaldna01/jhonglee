import React from 'react';
import cvData from '../data/cv.json';

const { education: educationData, experience: experienceData, publication: publicationData, project: projectData } = cvData;

function CvList({ items }) {
  return items.map((item, index) => (
    <div key={index} className="mb-3">
      <p className="text-[length:var(--body-lg)] text-black-3 mb-1">{item.date}</p>
      <div className="flex items-baseline gap-2">
        {item.link ? (
          <a
            href={item.link}
            className="text-primary no-underline text-[1.2em] cursor-pointer"
            target="_blank"
            rel="noopener noreferrer"
          >
            •
          </a>
        ) : (
          <span className="text-black-3 text-[1.2em]">•</span>
        )}
        <p
          className={`m-0 text-[length:var(--body-lg)] font-noto ${item.link ? 'cursor-pointer text-black-1' : ''}`}
          onClick={() => item.link && window.open(item.link, '_blank')}
        >
          {item.degree}
        </p>
      </div>
    </div>
  ));
}

function Cv() {
  return (
    <section className="pt-20 md:pt-28 lg:pt-36 pb-16 px-[var(--layout-margin)]">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-[length:var(--h1)] font-normal text-center mb-0">Jae Hong Lee | 이재홍</h1>

        <div className="h-12 md:h-16" />

        <div className="mb-6">
          <p className="text-[length:var(--body-md)] font-semibold font-sans">Engineer, Designer, Researcher</p>
          <p className="text-[length:var(--body-md)] font-noto leading-7">
            My name is Jae Hong Lee. I am a Computer Science Major with a Visual Arts Minor at Boston
            University. I specialize in merging technical and creative disciplines to develop interactive
            digital experiences that are both functional and visually compelling.
            <br />
            My background spans Algorithm design, AI &amp; Machine Learning, and Quantum Computing,
            complemented by strong skills in visual design and creative tools.
          </p>

          <div className="h-6" />

          <div className="flex flex-wrap gap-3 md:gap-5">
            {[
              { label: 'CV',        href: 'public/pdf/Jae_Hong_Lee_Resume.pdf' },
              { label: 'Email',     href: 'mailto:ll.leejaehong@gmail.com' },
              { label: 'LinkedIn',  href: 'https://www.linkedin.com/in/hong-lee-0821/' },
              { label: 'GitHub',    href: 'https://github.com/digitaldna01' },
              { label: 'Instagram', href: 'https://www.instagram.com//' },
            ].map(({ label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary no-underline hover:text-primary-dark transition-colors duration-300 font-sans"
              >
                {label}
              </a>
            ))}
          </div>
        </div>

        {[
          { title: 'Education',    items: educationData },
          { title: 'Experience',   items: experienceData },
          { title: 'Publication',  items: publicationData },
          { title: 'Project',      items: projectData },
        ].map(({ title, items }) => (
          <div key={title} className="mb-10">
            <div className="h-6 md:h-10" />
            <h2 className="text-[length:var(--body-md)] font-semibold font-sans mb-2">{title}</h2>
            <CvList items={items} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default Cv;

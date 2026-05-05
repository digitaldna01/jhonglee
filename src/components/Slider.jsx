import React from 'react';
import '../styles/slider.css';
import 'animate.css';
import 'hover.css';
import useWow from '../hooks/useWow';

const WORDS = ['ENGINEER', 'DESIGNER', 'RESEARCHER'];

function Slider() {
  const [currentWordIndex, setCurrentWordIndex] = React.useState(0);

  useWow({ animateClass: 'animate_animated', mobile: true, live: true, offset: 50 });

  React.useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => (prev + 1) % WORDS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="no-js">
      <section id="slider-area">
        <div className="px-[var(--layout-margin)] max-w-[var(--layout-width)] mx-auto">
          <div className="text-center">
            <div className="block wow animate__animated animate__fadeInUp" data-wow-delay=".3s">
              <section className="cd-intro">
                <h1
                  className="wow animate__fadeInUp animate__animated cd-headline slide"
                  data-wow-delay=".4s"
                >
                  <span>HI, MY NAME IS Jay &amp; I AM A</span>
                  <br />
                  <span className="cd-words-wrapper">
                    {WORDS.map((word, i) => (
                      <b key={word} className={currentWordIndex === i ? 'is-visible' : ''}>
                        {word}
                      </b>
                    ))}
                  </span>
                </h1>
              </section>

              <h2 className="wow animate__fadeInUp animate__animated" data-wow-delay=".6s">
                I am a student at Boston University studying Computer Science and Visual Arts.{' '}
                <br className="hidden md:block" />
                This site showcases some of my work
              </h2>

              <a
                className="wow animate__fadeInUp animate__animated btn btn-lines hvr-bounce-to-right"
                data-wow-delay=".9s"
                href="pdf/Jae_Hong_Lee_Resume.pdf"
                target="_blank"
              >
                Discover Resume
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Slider;

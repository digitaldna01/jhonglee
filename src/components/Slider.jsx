import React, { useEffect, useRef } from "react";

import "../styles/slider.css";
import "../index.css";
import "bootstrap/dist/css/bootstrap.min.css";
// Import Bootstrap JavaScript
import "bootstrap/dist/js/bootstrap.bundle.min.js";

import "animate.css";
import "hover.css";

function Slider() {
  const words = ["ENGINEER", "DESIGNER", "RESEARCHER"];
  const [currentWordIndex, setCurrentWordIndex] = React.useState(0);
  const headlineRef = useRef(null);

  useEffect(() => {
    let interval;

    (async () => {
      const WOWNS = await import("wowjs");

      const WowCtor = WOWNS.WOW || WOWNS.default?.WOW || WOWNS.default || WOWNS;
      if (typeof WowCtor === "function") {
        new WowCtor().init();
      }
      interval = setInterval(() => {
        setCurrentWordIndex((prev) => (prev + 1) % words.length);
      }, 3000);
    })();

    return () => clearInterval(interval); // Clean up interval on component unmount
  }, []);

  return (
    <div className="no-js">
      <section id="slider-area">
        <div className="container">
          <div className="row">
            <div className="col-md-12 text-center">
              <div className="block wow fadeInUp" data-wow-delay=".3s">
                <section className="cd-intro">
                  <h1
                    className="wow fadeInUp animated cd-headline slide"
                    data-wow-delay=".4s"
                  >
                    <span>HI, MY NAME IS Jay &amp; I AM A</span>
                    <br />
                    <span className="cd-words-wrapper">
                      <b className={currentWordIndex === 0 ? "is-visible" : ""}>
                        {words[0]}
                      </b>
                      <b className={currentWordIndex === 1 ? "is-visible" : ""}>
                        {words[1]}
                      </b>
                      <b className={currentWordIndex === 2 ? "is-visible" : ""}>
                        {words[2]}
                      </b>
                    </span>
                  </h1>
                </section>

                <h2 className="wow fadeInUp animated" data-wow-delay=".6s">
                  I am a student at Boston University studying Computer Science
                  and Visual Arts. <br />
                  This site showcase some of my work
                </h2>

                <a
                  className="wow fadeInUp animated btn btn-lines hvr-bounce-to-right"
                  data-wow-delay=".9s"
                  href="pdf/Jae_Hong_Lee_Resume.pdf"
                  target="_blank"
                >
                  Discover Resume
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Slider;

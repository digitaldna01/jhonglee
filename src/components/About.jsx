import React from 'react';
import 'animate.css';
import useWow from '../hooks/useWow';

function About() {
  useWow();

  return (
    <section className="py-16 md:py-20 lg:py-28">
      <div className="px-[var(--layout-margin)] max-w-[var(--layout-width)] mx-auto">
        <div className="flex flex-col md:flex-row gap-8">
          <div
            className="w-full md:w-1/2 px-2 md:px-4 wow fadeInLeft"
            data-wow-delay=".3s"
            data-wow-duration="500ms"
          >
            <h2 className="text-[length:var(--h3)] font-semibold uppercase mb-8 text-black-1">
              About Me
            </h2>
            <p className="text-black-2 text-[length:var(--body-md)] leading-7 mb-8">
              My name is Jae Hong Lee. I am a Computer Science Major with a
              Visual Arts Minor at Boston University. I specialize in merging
              technical and creative disciplines to develop interactive digital
              experiences that are both functional and visually compelling.
            </p>
            <p className="text-black-2 text-[length:var(--body-md)] leading-7 mb-8">
              My background spans Algorithm design, AI &amp; Machine Learning, and
              Quantum Computing, complemented by strong skills in visual design
              and creative tools. I specialize in algorithmic analysis and
              optimization, with a strong focus on data-driven solutions using
              advanced frameworks like TensorFlow and PyTorch. My approach
              combines technical expertise with artistic principles to enhance
              user experience and digital media.
            </p>
          </div>

          <div
            className="w-full md:w-1/2 px-2 md:px-4 wow fadeInRight"
            data-wow-delay=".3s"
            data-wow-duration="500ms"
          >
            <img src="/images/site/about/about.png" alt="" className="max-w-full h-auto" />
          </div>
        </div>
      </div>
    </section>
  );
}

export default About;

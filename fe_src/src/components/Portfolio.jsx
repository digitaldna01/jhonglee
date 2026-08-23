import React, { useState } from 'react';
import 'animate.css';
import useWow from '../hooks/useWow';

const portfolioData = [
  {
    title: 'Quantum Simulator',
    description: 'TensorNetwork Quantum Simulator',
    imageUrl: '/images/projects/quantum-simulator/cover.png',
    demoLink: '404.html',
    detailsLink: 'https://github.com/digitaldna01/quantum-simulator',
    wowDelay: '0ms',
  },
  {
    title: 'Handpose Predict',
    description: 'AI-Driven Hand-pose estimation model',
    imageUrl: '/images/projects/hand-pose-estimation/cover.png',
    readLink: 'https://www.mdpi.com/2079-9292/13/10/1970',
    wowDelay: '300ms',
  },
  {
    title: 'Visual Art Portfolio',
    description: 'Visual Arts Minor Portfolio',
    imageUrl: '/images/projects/visual-art-portfolio/cover.jpg',
    detailsLink: 'artgallery.html',
    wowDelay: '300ms',
  },
  {
    title: 'Gill Sans',
    description: 'Gill Sans Typography Video',
    imageUrl: '/images/projects/gill-sans/cover.png',
    watchLink: '#',
    wowDelay: '600ms',
  },
];

function PortfolioItem({ title, description, imageUrl, demoLink, detailsLink, readLink, watchLink, wowDelay }) {
  const linkHref = detailsLink || watchLink || demoLink || readLink;
  return (
    <div className="w-full sm:w-1/2 lg:w-1/4 px-3">
      <figure
        className="group bg-white mb-11 shadow-sm overflow-hidden wow fadeInLeft animated"
        data-wow-duration="500ms"
        data-wow-delay={wowDelay}
      >
        {/* Image + hover overlay */}
        <div className="relative overflow-hidden">
          <img
            src={imageUrl}
            className="w-full h-auto group-hover:scale-[1.2] transition-transform duration-[400ms]"
            alt={title}
          />
          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-[400ms] flex items-center justify-center gap-2">
            {demoLink && (
              <a
                rel="gallery"
                href={demoLink}
                className="scale-0 group-hover:scale-100 transition-all duration-[400ms] text-white px-[23px] py-[10px] border border-white text-sm no-underline hover:bg-[#24456b] hover:border-[#24456b]"
              >
                Demo
              </a>
            )}
            {detailsLink && (
              <a
                target="_blank"
                href={detailsLink}
                className="scale-0 group-hover:scale-100 transition-all duration-[400ms] text-white px-[23px] py-[10px] border border-white text-sm no-underline hover:bg-[#24456b] hover:border-[#24456b]"
              >
                Details
              </a>
            )}
            {readLink && (
              <a
                target="_blank"
                href={readLink}
                className="scale-0 group-hover:scale-100 transition-all duration-[400ms] text-white px-[23px] py-[10px] border border-white text-sm no-underline hover:bg-[#24456b] hover:border-[#24456b]"
              >
                Read
              </a>
            )}
            {watchLink && (
              <a
                href={watchLink}
                className="scale-0 group-hover:scale-100 transition-all duration-[400ms] text-white px-[23px] py-[10px] border border-white text-sm no-underline hover:bg-[#24456b] hover:border-[#24456b]"
              >
                Watch
              </a>
            )}
          </div>
        </div>

        {/* Caption */}
        <figcaption className="px-6 py-5 text-black-2">
          <h4 className="m-0">
            <a
              className="text-[length:var(--body-lg)] text-[#24456b] no-underline hover:text-secondary-dark"
              href={linkHref}
            >
              {title}
            </a>
          </h4>
          <p className="text-[length:var(--body-sm)] mt-1 mb-0">{description}</p>
        </figcaption>
      </figure>
    </div>
  );
}

function Portfolio() {
  useWow();

  return (
    <section className="py-16 lg:py-20 bg-[#fcfcfc]">
      <div className="px-[var(--layout-margin)] max-w-[var(--layout-width)] mx-auto">
        <h2
          className="text-[length:var(--h3)] font-semibold uppercase mb-5 wow fadeInUp animated"
          data-wow-delay=".3s"
          data-wow-duration="500ms"
        >
          Some Of My Featured Works
        </h2>
        <p
          className="text-black-2 text-[length:var(--body-md)] font-light mb-10 wow fadeInUp animated"
          data-wow-delay=".5s"
          data-wow-duration="500ms"
        >
          My recent projects focus on advancements in quantum computing simulation, developing
          cutting-edge design solutions, and advancing AI research.{' '}
          <br className="hidden md:block" />
          Discover more about each of these exciting areas below.
        </p>

        <div className="flex flex-wrap -mx-3">
          {portfolioData.map((item, index) => (
            <PortfolioItem key={index} {...item} />
          ))}
        </div>
      </div>

      <div className="text-center mt-4">
        <a
          href="/work"
          className="text-[length:var(--body-md)] text-secondary no-underline transition-colors duration-300 hover:text-primary"
        >
          Discover More
        </a>
      </div>
    </section>
  );
}

export default Portfolio;

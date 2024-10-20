import React, { useEffect, useState, useLayoutEffect } from 'react';
import '../css/portfolio.css';
import '../../index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import WOW from 'wowjs';
import 'animate.css';

const portfolioData = [
    {
        title: 'Quantum Simulator',
        description: 'TensorNetwork Quantum Simulator',
        imageUrl: 'images/quantum.png',
        demoLink: '404.html',
        detailsLink: 'https://github.com/digitaldna01/quantum-simulator',
        wowDelay: '0ms'
    },
    {
        title: 'Handpose estimation',
        description: 'AI-Driven Hand-pose estimation model',
        imageUrl: 'images/handpose.png',
        readLink: 'https://www.mdpi.com/2079-9292/13/10/1970',
        wowDelay: '300ms'
    },
    {
        title: 'Visual Art Portfolio',
        description: 'Visual Arts Minor Portfolio',
        imageUrl: 'images/art.jpg',
        detailsLink: 'artgallery.html',
        wowDelay: '300ms'
    },
    {
        title: 'Gill Sans',
        description: 'Gill Sans Typography Video',
        imageUrl: 'images/typography.png',
        watchLink: '#',
        wowDelay: '600ms'
    }
];

function PortfolioItem({ title, description, imageUrl, demoLink, detailsLink, readLink, wowDelay, watchLink, itemHeight }) {
    return (
        <div className="col-md-3 col-sm-6">
            <figure className='wow fadeInLeft animated' data-wow-duration="500ms" data-wow-delay={wowDelay} style={{ minHeight: `${itemHeight}px` }}>
                <div className="img-wrapper">
                    <img src={imageUrl} className="img-fluid" alt={title} />
                    <div className="overlay">
                        <div className="buttons">
                            {demoLink && <a rel="gallery" className="fancybox" href={demoLink}>Demo</a>}
                            {detailsLink && <a target="_blank" href={detailsLink}>Details</a>}
                            {readLink && <a target="_blank" href={readLink}>Read</a>}
                            {watchLink && <a href={watchLink} className="watch-link">Watch</a>}
                        </div>
                    </div>
                </div>
                <figcaption style={{ height: `${itemHeight - 250}px` }}>
                    <h4>
                        <a className='portfolio-title' href={detailsLink || watchLink || demoLink || readLink}>{title}</a>
                    </h4>
                    <p>{description}</p>
                </figcaption>
            </figure>
        </div>
    );
}

function Portfolio() {
    const [itemHeights, setItemHeights] = useState([]);
    const [maxHeight, setMaxHeight] = useState(0);

    const setItemHeight = (height) => {
        if (!itemHeights.includes(height)) { // 중복 체크
            setItemHeights((prevHeights) => [...prevHeights, height]);
        }
    };

    useLayoutEffect(() => {
        if (itemHeights.length === portfolioData.length) {
            const maxItemHeight = Math.max(...itemHeights);
            setMaxHeight(maxItemHeight);
            console.log("All Item Heights:", itemHeights); // 모든 아이템의 높이 출력
            console.log("Max Item Height:", maxItemHeight); // 최대 아이템 높이 출력
        }
    }, [itemHeights]);

    useEffect(() => {
        // Initialize WOW.js when the component mounts
        new WOW.WOW().init();
    }, []);

    return (
        <section className='portfolio'>
            <div className='container'>
                <h2 className="subtitle wow fadeInUp animated" data-wow-delay=".3s" data-wow-duration="500ms">Some Of My Featured Works</h2>
                <p className="subtitle-des wow fadeInUp animated" data-wow-delay=".5s" data-wow-duration="500ms">My recent projects focus on advancements in quantum computing simulation, developing cutting-edge design solutions, and advancing AI research. <br />Discover more about each of these exciting areas below.</p>
                <div className='row'>
                    {portfolioData.map((item, index) => (
                        <PortfolioItem key={index} {...item} setItemHeight={setItemHeight} itemHeight={maxHeight} />
                    ))}
                </div>
            </div>
            <div className='text-center'>
                <a href='/projects' className='more-projects'>Discover More</a>
            </div>
        </section>
    );
}

export default Portfolio;
import React from 'react';

// Import CSS
import './css/cv.css'; // CSS 파일을 import 합니다
import './css/info.css';
import './../index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
// Import Bootstrap JavaScript
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import Footer from './components/Footer';

function Cv() {
    const educationData = [
        {
            degree: "Boston University / Bachelor of Computer Science / Minor in Visual Arts",
            date: "September 2019 - Present / Boston, MA",
            link: "https://www.bu.edu" 
        },
        {
            degree: "Korea University / Department of Computer Science and Engineering / Visiting Student",
            date: "September 2022 - June 2022 / Seoul, KR",
            link: "https://www.korea.ac.kr" 
        },
        {
            degree: "Aquinas Institute of Rochester / High School ",
            date: "September 2016 - June 2019 / Rochester, NY"
        },
        {
            degree: "Bowie High School / High School ",
            date: "September 2015 - June 2016 / Austin, TX"
        },       
    ];

    const experienceData = [
        {
            degree: "Boston University (IVC Group) / Undergraduate Research / Computer Vision",
            date: "April 2024 - Present / Boston, MA",
            link: "https://www.bu.edu/cs/research-groups/ivc/" 
        },
        {
            degree: "Korea Electronics Technology Institute / Research Intern / Quantum Computing",
            date: "June 2024 - August 2024 / Seongnam, KR",
            link: "https://www.keti.re.kr/eng/main/main.php" 
        },
        {
            degree: "AI-driven Hand Pose estimation / Undergraduate Research / Artificial Intelligence ",
            date: "September 2023 - May 2024 / Tucson, AZ",
            link: "https://www.mdpi.com/2079-9292/13/10/1970" 
        },
        {
            degree: "Korea Electronics Technology Institute / Research Intern / Computer Vision ",
            date: "June 2022 - August 2022 / Seongnam, KR",
            link: "https://www.keti.re.kr/eng/main/main.php" 
        },
        {
            degree: "Xenix Studio / Software Engineer Intern / Blockchain and Frontend Develop",
            date: "July 2020 - November 2020 / Seoul, KR",
        },
    ];

    const publicationData = [
        {
            degree: "Machine Learning-Based Hand Pose Generation Using a Haptic Controller ",
            date: "May 2024 / Eung Joo Lee, Jongin Choi",
            link: "https://www.mdpi.com/2079-9292/13/10/1970" 
        },
    ];

    const projectData = [
        {
            degree: "TO-DO Calendar Web",
            date: "January 2024 - May 2024 / Boston, MA",
            link: "https://github.com/CS-411-To-Do-Calendar/cs411-to-do-calendar"
        },
    ];
    return(
        <>
        <section id="cv" className=''>
            <div className='container cv-top-spacing'>
                <div className='row justify-content-center'>
                    <div className='col-12 col-lg-10'>
                        <h1 className='cv-title text-center'>Jae Hong Lee | 이재홍</h1>
                        <div className='box-5'></div>
                        <div className='cv-introduction'>
                            <p className='cv-subtitle'>Engineer, Designer, Researcher </p>
                            <p className='cv-text'>My name is Jae Hong Lee. I am a Computer Science Major with a Visual Arts Minor at Boston University. I specialize in merging technical and creative disciplines to develop interactive digital experiences that are both functional and visually compelling. <br/> My background spans Algorithm design, AI & Machine Learning, and Quantum Computing, complemented by string skills in visual design and creative tools. I specialize in algorithmic analysis and optimization, with a strong focus on data-driven solutions using advanced frameworks like TensorFlow and PyTorch. My approach combines technical expertise with artistic principles to enhance user experience and digital media. </p>
                            <div className='box-4'></div>
                            <div className='cv-contact'>
                                <a href="public/pdf/Jae_Hong_Lee_Resume.pdf" target='_blank'>CV</a>
                                <a href="mailto:ll.leejaehong@gmail.com" target='_blank'>Email</a>
                                <a href="https://www.linkedin.com/in/hong-lee-0821/" target='_blank'>LinkedIn</a>
                                <a href="https://github.com/digitaldna01" target='_blank'>GitHub</a>
                                <a href="https://www.instagram.com//" target='_blank'>Instagram</a>
                            </div>
                        </div>  
                        <div className='box-4'></div>
                        <div className='cv-education'>
                            <h2 className='cv-subtitle education-title'>Education</h2>
                            {educationData.map((item, index) => (
                                <div key={index} className="cv-education-item">
                                    <p className="cv-list-date">{item.date}</p>
                                    <div className="cv-list-item">
                                        {item.link ? (
                                            <a href={item.link} className="cv-list-dot cv-list-dot-link" target="_blank" rel="noopener noreferrer">•</a>
                                        ) : (
                                            <span className="cv-list-dot">•</span>
                                        )}
                                        <p className="cv-list-text">{item.degree}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className='box-4'></div>
                        <div className='cv-experience'>
                            <h2 className='cv-subtitle education-title'>Experience</h2>
                            {experienceData.map((item, index) => (
                                <div key={index} className="cv-education-item">
                                    <p className="cv-list-date">{item.date}</p>
                                    <div className="cv-list-item">
                                        {item.link ? (
                                            <a href={item.link} className="cv-list-dot cv-list-dot-link" target="_blank" rel="noopener noreferrer">•</a>
                                        ) : (
                                            <span className="cv-list-dot">•</span>
                                        )}
                                        <p className="cv-list-text">{item.degree}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className='box-4'></div>
                        <div className='cv-publication'>
                            <h2 className='cv-subtitle education-title'>Publication</h2>
                            {publicationData.map((item, index) => (
                                <div key={index} className="cv-education-item">
                                    <p className="cv-list-date">{item.date}</p>
                                    <div className="cv-list-item">
                                        {item.link ? (
                                            <a href={item.link} className="cv-list-dot cv-list-dot-link" target="_blank" rel="noopener noreferrer">•</a>
                                        ) : (
                                            <span className="cv-list-dot">•</span>
                                        )}
                                        <p className="cv-list-text">{item.degree}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className='box-4'></div>
                        <div className='cv-project'>
                            <h2 className='cv-subtitle education-title'>Project</h2>
                            {projectData.map((item, index) => (
                                <div key={index} className="cv-education-item">
                                    <p className="cv-list-date">{item.date}</p>
                                    <div className="cv-list-item">
                                        {item.link ? (
                                            <a href={item.link} className="cv-list-dot cv-list-dot-link" target="_blank" rel="noopener noreferrer">•</a>
                                        ) : (
                                            <span className="cv-list-dot">•</span>
                                        )}
                                        <p className="cv-list-text">{item.degree}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
        <Footer />
        </>

    );
}

export default Cv
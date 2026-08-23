import { useEffect, useRef } from 'react';
import useTheme from '../hooks/useTheme';
import MapLayer from '../landing/components/MapLayer';
import Intro from '../landing/components/Intro';
import ContactCorner from '../landing/components/ContactCorner';
import '../styles/landing.css';

/* Landing — full-viewport similarity map (chat session lands next). */
export default function Info() {
  const { theme } = useTheme();
  const graphRef = useRef(null);

  // non-scrolling page + transparent navbar while this route is mounted
  useEffect(() => {
    document.documentElement.classList.add('route-landing');
    return () => document.documentElement.classList.remove('route-landing');
  }, []);

  return (
    <div className="landing">
      <MapLayer theme={theme} introActive graphRef={graphRef} />
      <Intro />
      <ContactCorner />
    </div>
  );
}

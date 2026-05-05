import { useEffect, useRef } from 'react';

export default function useWow(options) {
  const optionsRef = useRef(options);
  useEffect(() => {
    let cancel = false;
    (async () => {
      const WOWNS = await import('wowjs');
      const WowCtor = WOWNS.WOW || WOWNS.default?.WOW || WOWNS.default || WOWNS;
      if (!cancel && typeof WowCtor === 'function') new WowCtor(optionsRef.current).init();
    })();
    return () => { cancel = true; };
  }, []);
}

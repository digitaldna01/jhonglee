import { useState } from "react";
import useLang, { LangContext } from "../hooks/useLang";

export function LangProvider({ initial = "en", children }) {
  const [locale, setLocale] = useState(initial);
  return (
    <LangContext.Provider value={{ locale, setLocale }}>
      {children}
    </LangContext.Provider>
  );
}

/* Renders its children only while `locale` is the active one. Posts wrap
   each section in <Lang locale="en"> … <Lang locale="ko">. */
export function Lang({ locale, children }) {
  const { locale: active } = useLang();
  if (active !== locale) return null;
  return <>{children}</>;
}

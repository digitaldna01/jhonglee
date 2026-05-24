import { createContext, useContext, useState } from "react";

const LangContext = createContext({ locale: "en", setLocale: () => {} });

export function LangProvider({ initial = "en", children }) {
  const [locale, setLocale] = useState(initial);
  return (
    <LangContext.Provider value={{ locale, setLocale }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

export function Lang({ locale, children }) {
  const { locale: active } = useContext(LangContext);
  if (active !== locale) return null;
  return <>{children}</>;
}

import { createContext, useContext } from "react";

/* The locale context lives here, apart from the <Lang> components in
   utils/lang.jsx, so each file exports one kind of thing (react-refresh). */
export const LangContext = createContext({ locale: "en", setLocale: () => {} });

export default function useLang() {
  return useContext(LangContext);
}

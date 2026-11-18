import { useEffect, useState } from "react";
import { prefs } from "./api";

export type Theme = "dark" | "light";

function current(): Theme {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

/** Light/dark preference: a per-device convenience stored in localStorage (dark is the default brand look). */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (typeof document === "undefined" ? "dark" : current()));
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "light") el.setAttribute("data-theme", "light");
    else el.removeAttribute("data-theme");
    prefs.set("theme", theme);
    // Keep every mounted toggle in sync.
    window.dispatchEvent(new CustomEvent("cul-theme", { detail: theme }));
  }, [theme]);
  useEffect(() => {
    const on = (e: Event) => setTheme((e as CustomEvent<Theme>).detail);
    window.addEventListener("cul-theme", on);
    return () => window.removeEventListener("cul-theme", on);
  }, []);
  return { theme, toggle: () => setTheme((t) => (t === "light" ? "dark" : "light")) };
}

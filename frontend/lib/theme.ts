export type Theme = "day" | "night";

export const THEME_KEY = "fixpoint-theme";
export const THEME_EVENT = "fixpoint-theme";

/**
 * Runs inline in <head> before first paint, so the page never flashes the wrong theme. It can't import anything.
 * Order: `?theme=day|night` (demo links, screenshots), then the saved toggle, then the clock (day 06:00-17:00), as in Café De.
 */
export const THEME_SCRIPT = `(function(){var t=new URLSearchParams(location.search).get("theme");try{if(t!=="day"&&t!=="night")t=localStorage.getItem("${THEME_KEY}")}catch(e){}if(t!=="day"&&t!=="night"){var h=new Date().getHours();t=h>=6&&h<17?"day":"night"}document.documentElement.classList.toggle("dark",t==="night")})()`;

export const currentTheme = (): Theme => (document.documentElement.classList.contains("dark") ? "night" : "day");

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "night");
  window.dispatchEvent(new Event(THEME_EVENT));
}

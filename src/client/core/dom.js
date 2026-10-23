// DOM shortcuts: $ by id, the toast, and keeping the place on a page that scrolls.
export const $ = (id) => document.getElementById(id);
export function toast(msg) {
  const t = document.createElement("div");
  t.className = "box toast px";
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}
// Under 1151px the page scrolls, not the panels (core/layout.css), so a panel built again can move what is on screen.
export const pageScrolls = () => !matchMedia("(min-width: 1151px)").matches;
// Call before a panel is built again; call what it returns after. The first item of the panel on screen that is
// still there (found by its attribute: the rebuild makes new elements) stays where it was; with the whole panel above
// the screen, what is under it stays put. Nothing to do where the panel scrolls itself.
export function keepPlace(box, attr) {
  if (!pageScrolls() || box.hidden) return () => {};
  const seen = [];
  for (const el of box.querySelectorAll(`[${attr}]`)) {
    const r = el.getBoundingClientRect();
    if (r.top >= innerHeight) break;
    if (r.bottom > 0) seen.push([el.getAttribute(attr), r.top]);
  }
  const bottom = box.getBoundingClientRect().bottom;
  return () => {
    let d = bottom <= 0 ? box.getBoundingClientRect().bottom - bottom : 0;
    for (const [key, top] of seen) {
      const el = box.querySelector(`[${attr}="${CSS.escape(key)}"]`);
      if (el) { d = el.getBoundingClientRect().top - top; break; }
    }
    if (d) scrollBy(0, d);
  };
}

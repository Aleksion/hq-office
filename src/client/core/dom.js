// DOM shortcuts: $ by id, and the toast.
export const $ = (id) => document.getElementById(id);
export function toast(msg) {
  const t = document.createElement("div");
  t.className = "box toast px";
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}

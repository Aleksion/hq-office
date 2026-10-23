// The page's event channel. A feature listens here instead of being called from another area's file, so adding
// one is adding a folder, not editing boot.js or the room loop.
//
//   "state" (S)      after every /api/state load, once the built-in panels have rendered
//   "tick"           whenever the page clock wakes: only for a visible change, never on a fixed timer
//   "room:draw" (now) at the end of every room frame, after the workers; draw with px() from room/canvas.js
const handlers = new Map();

export function on(name, fn) {
  const list = handlers.get(name) ?? handlers.set(name, []).get(name);
  list.push(fn);
  return () => list.splice(list.indexOf(fn), 1);
}

export function emit(name, ...args) {
  const list = handlers.get(name);
  if (!list) return;
  for (const fn of [...list]) {
    try { fn(...args); } catch (e) { console.error(`${name} listener failed`, e); }
  }
}

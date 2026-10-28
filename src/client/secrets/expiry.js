// When a secret expires, said both ways: "in 6d 23h (Mon 2 Nov, 13:45)". Shared by the page, the server and hud.
// Local time of whoever runs it: the browser on the page, the server in notes to HQ, the shell for hud.

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (n) => String(n).padStart(2, "0");

// How long until `at`: "6d 23h", "23h", "5h 10m", "42m", "30s".
export function untilText(at, now = Date.now()) {
  const s = Math.max(0, Math.floor((at - now) / 1000));
  const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d) return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
  if (h) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  if (m) return `${m}m`;
  return `${s}s`;
}

// The moment itself: "today 13:45", "tomorrow 13:45", "Mon 2 Nov, 13:45" (local time).
export function atText(at, now = Date.now()) {
  const t = new Date(at), n = new Date(now);
  const time = `${two(t.getHours())}:${two(t.getMinutes())}`;
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(t) - day(n)) / 86_400_000);
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  if (days === -1) return `yesterday ${time}`;
  return `${DAYS[t.getDay()]} ${t.getDate()} ${MONTHS[t.getMonth()]}${t.getFullYear() !== n.getFullYear() ? ` ${t.getFullYear()}` : ""}, ${time}`;
}

// "expires in 6d 23h (Mon 2 Nov, 13:45)"
export function expiresText(at, now = Date.now()) {
  return `expires in ${untilText(at, now)} (${atText(at, now)})`;
}

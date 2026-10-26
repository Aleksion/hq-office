// Furniture that blocks walking, and paths around it.
import { H, W } from "./canvas.js";
import { SEATS } from "./spots.js";

// Furniture a worker cannot walk through, in tiles. Desks count only while they are drawn.
const FURNITURE = [];
for (let x = 17; x <= 22; x++) for (const y of [2, 3, 12, 13]) FURNITURE.push([x, y]); // the hero's counter, the couch
FURNITURE.push([16, 4], [16, 5], [23, 5], [23, 6], [0, 2], [14, 2], [15, 15]); // HQ terminal, coffee machine, plants
for (const x of [20, 21, 22]) FURNITURE.push([x, 14]); // the snack table
FURNITURE.push([23, 14], [23, 15]); // the kitchen coffee machine
let blocked = new Set();
const tileKey = (x, y) => `${x},${y}`;
export function rebuildBlocked(n) {
  blocked = new Set(FURNITURE.map(([x, y]) => tileKey(x, y)));
  for (const s of SEATS.slice(0, deskCount(n))) blocked.add(tileKey(s.x, s.y - 1)); // the desk sits in front of its seat
}
// Breadth-first search over free tiles. Waypoints from `from` to `to`, or null when no way exists.
function findPath(from, to) {
  const sx = Math.round(from.x), sy = Math.round(from.y), gx = Math.round(to.x), gy = Math.round(to.y);
  const came = new Map([[tileKey(sx, sy), null]]);
  const queue = [[sx, sy]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    if (x === gx && y === gy) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = tileKey(nx, ny);
      if (nx < 0 || nx >= W || ny < 2 || ny >= H || came.has(k)) continue;
      if (blocked.has(k) && !(nx === gx && ny === gy)) continue;
      came.set(k, [x, y]);
      queue.push([nx, ny]);
    }
  }
  if (!came.has(tileKey(gx, gy))) return null;
  const tiles = [];
  for (let p = [gx, gy]; came.get(tileKey(p[0], p[1])); p = came.get(tileKey(p[0], p[1]))) tiles.unshift({ x: p[0], y: p[1] });
  return [...tiles, { x: to.x, y: to.y }];
}

export function route(from, to) {
  const around = findPath(from, to);
  if (around) return around;
  const pts = [];
  if (Math.abs(from.y - to.y) > 0.01) {
    const cx = (x) => (x >= 15 ? x : Math.round(x / 2) * 2);
    pts.push({ x: cx(from.x), y: from.y }, { x: cx(from.x), y: to.y });
  }
  pts.push({ x: to.x, y: to.y });
  return pts;
}

export function deskCount(n) { return Math.min(SEATS.length, Math.max(14, Math.ceil(n / 7) * 7)); }

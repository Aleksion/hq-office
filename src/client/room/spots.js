// The room's layout in tiles: desks, the queue, HQ, the couch, the break room.
// layout, in tiles
export const SEATS = [];
for (let row = 0; row < 4; row++) for (let col = 0; col < 7; col++) SEATS.push({ x: 1 + col * 2, y: 4 + row * 3 });
export const QUEUE = [];
for (let k = 0; k < 8; k++) QUEUE.push({ x: 20, y: 4 + k });
for (let k = 0; k < 8; k++) QUEUE.push({ x: 21.2, y: 4 + k });
export const HQ_SPOT = [[17, 6], [18, 6], [17, 7], [18, 7], [16, 8], [17, 8], [18, 8], [16, 9], [17, 9], [18, 9]].map(([x, y]) => ({ x, y }));
export const WAIT_SPOT = [[22, 7], [23, 7], [22, 8], [23, 8], [22, 9], [23, 9], [22, 10], [23, 10]].map(([x, y]) => ({ x, y }));
export const COUCH = [17, 18, 19, 20, 21, 22].map((x) => ({ x, y: 13 }));
// The break room: done workers stand by the snack table (x 20 to 22, row 14), and parked ones sit on the couch.
export const DONE_SPOT = [16, 17, 18, 19, 16.5, 17.5, 18.5, 19.5].map((x, i) => ({ x, y: i < 4 ? 14.6 : 15.2 }));
export function slot(list, i) { const s = list[i % list.length]; const lap = Math.floor(i / list.length); return { x: s.x + lap * 0.3, y: s.y + lap * 0.2 }; }

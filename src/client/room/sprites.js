// The 16x16 worker sprite: heads, bodies, legs, walk frames, and drawSprite.
import { artId, blit, px } from "./canvas.js";

// 16x16 sprites in the style of the old handheld overworld: a big round head, thick black outlines, a fringe,
// eyes two pixels tall, arms out with the hands showing. head 10 rows, body 4, legs 2.
// k outline, h hair, H hair shine, d hair shadow, s skin, S skin shade, e eye, c shirt, L shirt light, C shirt shade,
// w white, a accent (collar, hat, band, bows), A accent shade, p trousers, P trousers shade, b shoes.
const HEAD_FRONT = ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhsshhsshhsshhk", "khsssssssssssshk", "khsssksssskssshk", "khsssksssskssshk", ".kSssssssssssSk."];
const HEAD_BACK = ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "kSkdhhhhhhhhdkSk", ".kkkddddddddkkk."];
const BODY_FRONT = ["..kkcccaaccckk..", ".kLkLccccccCkCk.", ".kskLccccccCksk.", "..kkpppppppPkk.."];
const LEGS_FRONT = [["...kppPkkpPPk...", "...kbbbkkbbbk..."], ["...kppPkkpPk....", "...kbbbk.kk....."]];
const HEAD_SIDE = ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhshsshk", "khhhhhhhSsssssk.", "khhhhhhhSssskssk", "khhhhhhhSssskssk", ".kkhhhhSsssssk.."];
const BODY_SIDE = ["...kkccaacckk...", "..kLcckLLkcCk...", "..kLccksskcCk...", "...kkppppPPk...."];
const LEGS_SIDE = [["...kpPk.kpPk....", "...kbbk.kbbk...."], ["....kppPk.......", "....kbbbk......."]];

// One head per kind of character; a worker gets one from his name. A head of 11 or 12 rows lets hair fall over the shoulders.
export const HEADS = [
  { down: HEAD_FRONT, up: HEAD_BACK, side: HEAD_SIDE }, // short
  { // cap
    down: ["....kkkkkkkk....", "..kkaaaaaaaakk..", ".kaawwaaaaaaaak.", "kaaaaaaaaaaaaaak", "kkAAAAAAAAAAAAkk", "khhsssssssssshhk", "khsssssssssssshk", "khsssksssskssshk", "khsssksssskssshk", ".kSssssssssssSk."],
    up: ["....kkkkkkkk....", "..kkaaaaaaaakk..", ".kaaaaaaaaaaaak.", "kaaaaaaaaaaaaaak", "kaaaaaaaaaaaaaak", "kAAAAAAAAAAAAAAk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "kSkdhhhhhhhhdkSk", ".kkkddddddddkkk."],
    side: ["....kkkkkkkk....", "..kkaaaaaaaakk..", ".kaaaaaaawwaak..", "kaaaaaaaaaaaaak.", "kaaaaaaaaAAAAAAk", "khhhhhhhhsssssk.", "khhhhhhhSsssssk.", "khhhhhhhSssskssk", "khhhhhhhSssskssk", ".kkhhhhSsssssk.."],
  },
  { // long
    down: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhssssssshhhk", "khhsssssssssshhk", "khhsskssssksshhk", "khhsskssssksshhk", "khhSssssssssShhk", "khhkcccaaccckhhk"],
    up: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", ".khhhhhhhhhhhhk.", ".kLkddddddddkCk."],
    side: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhshsshk", "khhhhhhhhsssssk.", "khhhhhhhhssskssk", "khhhhhhhhssskssk", "khhhhhhhhSssssk.", ".khhhhhkcaackk.."],
  },
  { // bun
    down: [".....kkkkkk.....", "..kkkhHHhhhkkk..", ".khhhkkkkkkhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhsssssssssshhk", "khsssssssssssshk", "khsssksssskssshk", "khsssksssskssshk", ".kSssssssssssSk."],
    up: [".....kkkkkk.....", "..kkkhHHhhhkkk..", ".khhhkkkkkkhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "kSkdhhhhhhhhdkSk", ".kkkddddddddkkk."],
    side: [".....kkkkkk.....", "..kkkhHHhhhkkk..", ".khhhkkkkkkhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhshsshk", "khhhhhhhSsssssk.", "khhhhhhhSssskssk", "khhhhhhhSssskssk", ".kkhhhhSsssssk.."],
  },
  { // spiky
    down: ["...k...k...k....", "..khk.khk.khk...", ".khHhkhhhkhhhk..", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhsshhsshhsshhk", "khsssssssssssshk", "khsssksssskssshk", "khsssksssskssshk", ".kSssssssssssSk."],
    up: ["...k...k...k....", "..khk.khk.khk...", ".khHhkhhhkhhhk..", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "kSkdhhhhhhhhdkSk", ".kkkddddddddkkk."],
    side: ["...k...k...k....", "..khk.khk.khk...", ".khHhkhhhkhhhk..", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhshsshk", "khhhhhhhSsssssk.", "khhhhhhhSssskssk", "khhhhhhhSssskssk", ".kkhhhhSsssssk.."],
  },
  { // bald
    down: ["....kkkkkkkk....", "..kksssssssskk..", ".kswwsssssssssk.", "kswssssssssssssk", "kssssssssssssssk", "khsssssssssssshk", "khsssssssssssshk", "khsssksssskssshk", "khsssksssskssshk", ".khhhsssssshhhk."],
    up: ["....kkkkkkkk....", "..kksssssssskk..", ".kswwsssssssssk.", "kswssssssssssssk", "kssssssssssssssk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "kSkdhhhhhhhhdkSk", ".kkkddddddddkkk."],
    side: ["....kkkkkkkk....", "..kksssssssskk..", ".kssssssswwsssk.", "kssssssssssssssk", "kssssssssssssssk", "khhhhhsssssssssk", "khhhhSssssssssk.", "khhhhSsssssskssk", "khhhhSsssssskssk", ".kkhhhShhhhhhk.."],
  },
  { // beanie
    down: ["......kwwk......", "..kkkaaaaaakkk..", ".kaaaaaaaaaaaak.", "kaaLaaaaaaaaaaak", "kAAAAAAAAAAAAAAk", "khhsssssssssshhk", "khsssssssssssshk", "khsssksssskssshk", "khsssksssskssshk", ".kSssssssssssSk."],
    up: ["......kwwk......", "..kkkaaaaaakkk..", ".kaaaaaaaaaaaak.", "kaaLaaaaaaaaaaak", "kAAAAAAAAAAAAAAk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "kSkdhhhhhhhhdkSk", ".kkkddddddddkkk."],
    side: ["......kwwk......", "..kkkaaaaaakkk..", ".kaaaaaaaaaaaak.", "kaaLaaaaaaaaaaak", "kAAAAAAAAAAAAAAk", "khhhhhhhhssssssk", "khhhhhhhSsssssk.", "khhhhhhhSssskssk", "khhhhhhhSssskssk", ".kkhhhhSsssssk.."],
  },
  { // glasses
    down: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhsshhsshhsshhk", "khsssssssssssshk", "khskwwkkkkwwkshk", "khskseksskeskshk", ".kSssssssssssSk."],
    up: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "kSkdhhhhhhhhdkSk", ".kkkddddddddkkk."],
    side: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhshsshk", "khhhhhhhSsssssk.", "khhhhhhhSkkwwksk", "khhhhhhhSsskeksk", ".kkhhhhSsssssk.."],
  },
  { // pigtails
    down: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "kahhhhhhhhhhhhak", "khhsshhsshhsshhk", "khsssssssssssshk", "khsssksssskssshk", "khsssksssskssshk", "khkSssssssssSkhk"],
    up: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "kahhhhhhhhhhhhak", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "kSkdhhhhhhhhdkSk", "khhkddddddddkhhk"],
    side: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhaahhhhhhhhk", "khhhhhhhhhshsshk", "khhhhhhhSsssssk.", "khhhhhhhSssskssk", "khhhhhhhSssskssk", "khhkhhhSsssssk.."],
  },
  { // curly
    down: ["..kk.kkkkkk.kk..", ".khhkhhhhhhkhhk.", "khHHhhhhhhhhhhhk", "khhhdhhhhhhdhhhk", "khdhhhhhhhhhhdhk", "khhhsssssssshhhk", "khsssssssssssshk", "khsssksssskssshk", "khsssksssskssshk", ".kSssssssssssSk."],
    up: ["..kk.kkkkkk.kk..", ".khhkhhhhhhkhhk.", "khHHhhhhhhhhhhhk", "khhhdhhhhhhdhhhk", "khdhhhhhhhhhhdhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "kSkdhhhhhhhhdkSk", ".kkkddddddddkkk."],
    side: ["..kk.kkkkkk.kk..", ".khhkhhhhhhkhhk.", "khHHhhhhhhhhhhhk", "khhhdhhhhhhdhhhk", "khdhhhhhhhhhhdhk", "khhhhhhhhhshsshk", "khhhhhhhSsssssk.", "khhhhhhhSssskssk", "khhhhhhhSssskssk", ".kkhhhhSsssssk.."],
  },
  { // headband
    down: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "kaaaaaaaaaaaaaak", "khhsshhsshhsshhk", "khsssssssssssshk", "khsssksssskssshk", "khsssksssskssshk", ".kSssssssssssSk."],
    up: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "kaaaaaaaaaaaaaak", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "kSkdhhhhhhhhdkSk", ".kkkddddddddkkk."],
    side: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "kaaaaaaaaaaaaaak", "khhhhhhhhhshsshk", "khhhhhhhSsssssk.", "khhhhhhhSssskssk", "khhhhhhhSssskssk", ".kkhhhhSsssssk.."],
  },
  { // bob
    down: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khddddddddddddhk", "khhsskssssksshhk", "khhsskssssksshhk", "khhSssssssssShhk"],
    up: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", ".khhhhhhhhhhhhk.", ".kLkddddddddkCk."],
    side: ["....kkkkkkkk....", "..kkhhhhhhhhkk..", ".khHHhhhhhhhhhk.", "khHHhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khhhhhhhhdddddk.", "khhhhhhhhssskssk", "khhhhhhhhssskssk", "khhhhhhhhSssssk.", ".khhhhhkcaackk.."],
  },
  { // The default hero's own: a spiky mane, three spikes on top and a pointed fringe. Last, so no worker is given it.
    down: ["..k....kk....k..", "..khk.kHHk.khk..", ".khhHkhHHhkHhhk.", "kdhhHHhhHHhhhhdk", "kdhhhhhhhhhhhhdk", "khhhhhhhhhhhhhhk", "khhsshssshssshhk", "khsssksssskssshk", "khsssksssskssshk", ".kSssssssssssSk."],
    up: ["..k....kk....k..", "..khk.kHHk.khk..", ".khhHkhHHhkHhhk.", "kdhhHHhhHHhhhhdk", "kdhhhhhhhhhhhhdk", "khhhhhhhhhhhhhhk", "khhhhhhhhhhhhhhk", "khdhhhhhhhhhhdhk", "kSkdhhhhhhhhdkSk", ".kkkddddddddkkk."],
    side: [".k....kk........", "khk..kHHk..k....", "khhkkhHHhkkhk...", "kdhhHHhhHHhhhhk.", "kdhhhhhhhhhhhhhk", "khhhhhhhhhshsshk", "khhhhhhhSsshsssk", "khhhhhhhSssskssk", "khhhhhhhSssskssk", ".kkhhhhSsssssk.."],
  },
];

// Left is the right-facing frame flipped; the second walk frame facing up or down is the first one flipped.
export const mirrored = (dir, step) => dir === "left" || (step === 2 && (dir === "up" || dir === "down"));
// A look from room/themes.js (pal.look) dresses the body, and the head too when it has one. Hair that falls over the
// shoulders stays over the look's clothes.
// A look with a mask covers the face of the worker's own head: skin below the hairline turns to mask (m), an eye
// (an outline pixel between two skin pixels, or e) to the mask's eyes (x). Hair, glasses and the outline stay.
const FACE_FROM = 5;
export function maskFace(rows) {
  return rows.map((row, r) => r < FACE_FROM ? row : [...row].map((ch, c) => {
    if (ch === "s" || ch === "S") return "m";
    if (ch === "e") return "x";
    if (ch === "k" && "sS".includes(row[c - 1]) && "sS".includes(row[c + 1])) return "x";
    return ch;
  }).join(""));
}
// The head rows a palette is drawn with, facing dir: the look's own head, or the worker's, masked when the look says.
export function headRows(pal, dir) {
  const look = pal.look, set = look?.head ?? HEADS[pal.t] ?? HEADS[0];
  const rows = dir === "up" ? set.up : dir === "down" ? set.down : set.side;
  return look?.mask ? maskFace(rows) : rows;
}
function frame(dir, step, style = 0, look = null) {
  // step: 0 stand, 1 and 2 alternate walk frames
  const side = dir === "left" || dir === "right";
  const legsSet = side ? look?.legs?.side ?? LEGS_SIDE : look?.legs?.down ?? LEGS_FRONT;
  const legs = step === 0 ? legsSet[0] : legsSet[1];
  const head = headRows({ t: style, look }, dir);
  const body = look?.body ? (side ? look.body.side : dir === "up" ? look.body.up : look.body.down) : side ? BODY_SIDE : BODY_FRONT;
  const over = look?.body ? head.slice(10).map((row, i) => [...row].map((ch, c) => ("cLCaA".includes(ch) ? body[i][c] : ch)).join("")) : head.slice(10);
  return { rows: [...head.slice(0, 10), ...over, ...body.slice(head.length - 10), ...legs], mirror: mirrored(dir, step) };
}

// Digits for a look's number, 3 dots by 5, each dot 2 screen pixels: finer than the sprite's own pixels, so two
// digits fit on a chest and still read at real size.
const DIGITS = ["xxxx.xx.xx.xxxx", ".x.xx..x..x.xxx", "xxx..xxxxx..xxx", "xxx..x.xx..xxxx", "x.xx.xxxx..x..x", "xxxx..xxx..xxxx", "xxxx..xxxx.xxxx", "xxx..x..x..x..x", "xxxx.xxxxx.xxxx", "xxxx.xxxx..xxxx"];
function paintNumber(n, color) {
  const text = String(n), d = 2 / 3, w = text.length * 3 * d + (text.length - 1) * d;
  const x0 = 8 - w / 2, y0 = 10 + 1 / 3;
  [...text].forEach((ch, i) => {
    const g = DIGITS[ch.charCodeAt(0) - 48];
    for (let k = 0; k < 15; k++) if (g[k] === "x") px(x0 + i * 4 * d + (k % 3) * d, y0 + Math.floor(k / 3) * d, d, d, color);
  });
}

export function drawSprite(pal, x, y, dir, step, alpha = 1) {
  blit(`s${artId(pal)}|${dir}|${step}`, x, y, alpha, () => {
    const { rows, mirror } = frame(dir, step, pal.t, pal.look);
    for (let r = 0; r < 16; r++) {
      const row = rows[r];
      for (let c = 0; c < 16; c++) {
        const ch = row[mirror ? 15 - c : c];
        if (ch === "." || !ch) continue;
        px(c, r, 1, 1, pal[ch]);
      }
    }
    // The number reads the same both ways, so it is painted after the mirror; side-on it does not show.
    if (pal.look?.number && pal.number != null && (dir === "up" || dir === "down")) paintNumber(pal.number, pal.w);
  });
}

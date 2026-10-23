// The themes: how each level of the lane tree dresses. Data only; room/looks.js picks a look, sprites.js paints it.
//
// A theme lists one look per depth and one label mark per depth (depth 1 reports to HQ, 2 to a depth-1 lane, ...); deeper than the list wears the
// last one. `flat` is what a room with no tree yet wears (every lane straight under HQ): Office keeps the everyday
// look there, so nothing changes until the owner builds a tree. A look of null is the everyday look.
//
// A look is a clothing layer over the worker's own head and colours:
//   pal(base, h)  colours it adds or replaces; base is the worker's own palette, h the hash of its name
//   body          (optional) the 4 body rows facing down, up and side (side faces right; left is it flipped), in sprite letters
//   head          (optional) the 10 head rows facing down, up and side; replaces the worker's own head
//   number        (optional) a white number on the chest and back: the lane's place in the room
//   hides         accessory slots it leaves out, so a seasonal coat or hat never covers the level
// A mark is drawn at the start of a worker's name label, so the level reads from any side, even from behind at a
// desk: { color, pips } (pips 3, 2, 1 from the top level down, in a colour that matches the look).
// Letters as in sprites.js, plus: J/j jacket and its shade, n/N tie, V/v/y cardigan, its shade and buttons, g/G/q suit, its light
// and shade, m mask, x the mask's mark, o belt and gloves. Original art only.
import { shade } from "./palette.js";

// Suits stay near black, so depth 1 reads as one dark shape from any side; the tie is the worker's own colour.
const BLAZERS = ["#262c44", "#2c2c34", "#24323a"];

const BLAZER = {
  id: "blazer",
  pal: (base, h) => { const J = BLAZERS[(h >>> 24) % BLAZERS.length]; return { J, j: shade(J, 0.75), n: base.c, N: base.C, w: "#f8f8f8" }; },
  body: {
    down: ["..kkJJJwwJJJkk..", ".kJkJJwnnwJJkjk.", ".kskJJJnNJJjksk.", "..kkpppppppPkk.."],
    up: ["..kkJJJJJJJJkk..", ".kJkJJJJJJJjkjk.", ".kskJJJJJJJjksk.", "..kkJJJJJJJjkk.."], // from behind: all jacket, down to the hem
    side: ["...kkJJJJwnkk...", "..kJJJkjjkwnk...", "..kJJJksskJnk...", "...kkJJJJJjk...."],
  },
  hides: ["body"],
};

// Depth 2: a light cardigan over the worker's own shirt (it shows at the neck). Dark suit, light cardigan, bright
// shirt: the three office levels differ in lightness, which still reads from behind, where a desk shows only a sliver.
const CARDIGAN = {
  id: "cardigan",
  pal: () => ({ V: "#ece2c8", v: "#c4b48e", y: "#8a7450" }),
  body: {
    down: ["..kkVVVccVVVkk..", ".kVkVVVccVVvkvk.", ".kskVVVyVVVvksk.", "..kkpppppppPkk.."],
    up: ["..kkVVVVVVVVkk..", ".kVkVVVVVVVvkvk.", ".kskVVVVVVVvksk.", "..kkpppppppPkk.."],
    side: ["...kkVVVVVckk...", "..kVVVkVVkVck...", "..kVVVksskVvk...", "...kkppppPPk...."],
  },
  hides: ["body"],
};

// The guards: a hooded suit and a black mask with a white mark, the mark telling the rank. It shows on the back of
// the hood too, since a worker at a desk faces away. Depth 1 also wears a black belt.
const SUIT = { g: "#e0287a", G: "#ff6aa8", q: "#9a1a52", p: "#e0287a", P: "#9a1a52", m: "#121018", x: "#f8f8f8", o: "#2a2830", b: "#2a2830", s: "#2a2830" };
function guard(id, front, back, belt) {
  const waist = belt ? ["..kkooooooookk..", "...kkooooook...."] : ["..kkgggggggqkk..", "...kkgggggqk...."];
  return {
    id,
    pal: () => SUIT,
    head: {
      down: ["....kkkkkkkk....", "..kkggggggggkk..", ".kgGGgggggggggk.", "kgGgggggggggggqk", "kggmmmmmmmmmmggk", ...front.map((r) => `kgmm${r}mmgk`), ".kgmmmmmmmmmmgk."],
      up: ["....kkkkkkkk....", "..kkggggggggkk..", ".kgGGgggggggggk.", "kgGgggggggggggqk", "kgggggggggggggqk", ...back.map((r) => `kggg${r}gggk`), ".kqqggggggggqqk."],
      side: ["....kkkkkkkk....", "..kkggggggggkk..", ".kgGGgggggggggk.", "kgGgggggggggggk.", "kgggggggmmmmmmmk", "kggggggmmmmmmmk.", "kggggggmmmxxmmmk", "kggggggmmmxxmmmk", "kggggggmmmmmmmk.", ".kkggggmmmmmmk.."],
    },
    body: {
      down: ["..kkgggqqgggkk..", ".kGkGggggggqkqk.", ".kokGggggggqkok.", waist[0]],
      up: ["..kkggggggggkk..", ".kGkGggggggqkqk.", ".kokGggggggqkok.", waist[0]],
      side: ["...kkggqqggkk...", "..kGggkGGkgqk...", "..kGggkookgqk...", waist[1]],
    },
    hides: ["head", "body"],
  };
}
// The marks, 8 columns wide in the middle of the face (front: on the mask; back: on the hood).
const SQUARE = ["mmxxxxmm", "mmxmmxmm", "mmxmmxmm", "mmxxxxmm"];
const TRIANGLE = ["mmmxxmmm", "mmxxxxmm", "mxxxxxxm", "mmmmmmmm"];
const onHood = (mark) => mark.map((r) => r.replace(/m/g, "g"));
const GUARD_SQUARE = guard("guard-square", SQUARE, onHood(SQUARE), true);
const GUARD_TRIANGLE = guard("guard-triangle", TRIANGLE, onHood(TRIANGLE), false);

// The players: a teal tracksuit (the everyday body in teal) and a white number. They keep their own heads.
const PLAYER = {
  id: "player",
  pal: () => ({ c: "#2a9d8f", L: "#52c4b4", C: "#1c6e64", a: "#2a9d8f", A: "#1c6e64", p: "#2a9d8f", P: "#1c6e64", w: "#f8f8f8" }),
  number: true,
  hides: ["body"],
};

export const THEMES = {
  office: {
    label: "OFFICE", flat: null, depths: [BLAZER, CARDIGAN, null],
    marks: [{ color: "#ffd84a", pips: 3 }, { color: "#ece2c8", pips: 2 }, { color: "#7fc8ff", pips: 1 }],
  },
  arena: {
    label: "ARENA", flat: PLAYER, depths: [GUARD_SQUARE, GUARD_TRIANGLE, PLAYER],
    marks: [{ color: "#ff5aa0", pips: 3 }, { color: "#ff5aa0", pips: 2 }, { color: "#3fd0bf", pips: 1 }],
  },
};
export const THEME_CHOICES = Object.keys(THEMES);

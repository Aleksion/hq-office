// The themes: how each level of the lane tree dresses. Data only; room/looks.js picks a look, sprites.js paints it.
//
// A theme lists one look per depth and one label mark per depth (depth 1 reports to HQ, 2 to a depth-1 lane, ...); deeper than the list wears the
// last one. `flat` is what a room with no tree yet wears (every lane straight under HQ): Office keeps the everyday
// look there, so nothing changes until the owner builds a tree. A look of null is the everyday look. `hero` dresses the
// owner's hero behind the counter and `hq` the HQ figure at its terminal (null: as they always were). A theme that
// dresses anyone dresses everyone: Office dresses only a tree's levels, and its everyday look is its costume.
//
// A look is a clothing layer over the worker's own head and colours:
//   pal(base, h)  colours it adds or replaces; base is the worker's own palette, h the hash of its name
//   body          (optional) the 4 body rows facing down, up and side (side faces right; left is it flipped), in sprite letters
//   head          (optional) the 10 head rows facing down, up and side; replaces the worker's own head
//   mask          (optional) true: a mask over the worker's own face (skin to m, eyes to x); hair and glasses stay
//   legs          (optional) the leg rows facing down and side, standing and walking, as LEGS_* in sprites.js
//   number        (optional) a white number on the chest and back: the lane's place in the room
//   hides         accessory slots it leaves out, so a seasonal coat or hat never covers the level
// A mark is drawn at the start of a worker's name label, so the level reads from any side, even from behind at a
// desk: { color, pips } (pips 3, 2, 1 from the top level down, in a colour that matches the look).
// Letters as in sprites.js, plus: J/j jacket and its shade, n/N tie, V/v/y cardigan, its shade and buttons, g/G/q suit, its light
// and shade, m mask, x the mask's mark, o belt and gloves, T/t/r tracksuit, its shade and light, u/U/z coat, its light
// and shade. Original art only.
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
function guard(id, front, back, belt, pal = SUIT) {
  const waist = belt ? ["..kkooooooookk..", "...kkooooook...."] : ["..kkgggggggqkk..", "...kkgggggqk...."];
  return {
    id,
    pal: () => pal,
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
    hides: ["head", "body", "hand"],
  };
}
// The marks, 8 columns wide in the middle of the face (front: on the mask; back: on the hood).
const SQUARE = ["mmxxxxmm", "mmxmmxmm", "mmxmmxmm", "mmxxxxmm"];
const TRIANGLE = ["mmmxxmmm", "mmxxxxmm", "mxxxxxxm", "mmmmmmmm"];
const onHood = (mark) => mark.map((r) => r.replace(/m/g, "g"));
const GUARD_SQUARE = guard("guard-square", SQUARE, onHood(SQUARE), true);
const GUARD_TRIANGLE = guard("guard-triangle", TRIANGLE, onHood(TRIANGLE), false);
// HQ, at its terminal: the senior guard, above every lane and below the game master. The same hooded suit and belt
// with a gold crown for its mark; HQ faces its terminal, so the crown on the back of the hood is the one that shows.
const CROWN = ["mxmxxmxm", "mxxxxxxm", "mxxxxxxm", "mmmmmmmm"];
const HQ_GUARD = guard("guard-crown", CROWN, onHood(CROWN), true, { ...SUIT, x: "#f0c040" });

// The players: a numbered tracksuit, top and trousers alike, with white piping down the sleeves and the legs, a white
// zip, white trainers and a white number on the chest and back. Every player wears the same one, so the room reads as
// a team in uniform; each keeps its own head (hair and face), which is how the owner still tells them apart. A
// seasonal hat or coat would break the uniform; a seasonal thing in the hand reads well and stays.
const PLAYER = {
  id: "player",
  pal: () => ({ T: "#17806f", t: "#0f5a4e", r: "#3cb8a3", w: "#f8f8f8", b: "#f0f0f0", p: "#17806f", P: "#0f5a4e" }),
  body: {
    down: ["..kkTTTwwTTTkk..", ".krkrTTTTTTtktk.", ".kskrTTTTTTtksk.", "..kkTTTTTTTtkk.."],
    up: ["..kkTTTTTTTTkk..", ".krkrTTTTTTtktk.", ".kskrTTTTTTtksk.", "..kkTTTTTTTtkk.."],
    side: ["...kkTTTTwTkk...", "..krTTkrrkTtk...", "..krTTksskTtk...", "...kkTTTTttk...."],
  },
  legs: {
    down: [["...kwpPkkpPwk...", "...kbbbkkbbbk..."], ["...kwpPkkpPk....", "...kbbbk.kk....."]],
    side: [["...kwPk.kwPk....", "...kbbk.kbbk...."], ["....kwpPk.......", "....kbbbk......."]],
  },
  number: true,
  hides: ["head", "body"],
};

// The game master: the owner's hero, at the top of the arena. A long black coat with a gold clasp and gold buttons,
// black gloves, and a black mask over the face with gold eyes. It covers only the face, so the chosen hero keeps its
// own hair (and glasses): the HERO setting still shows. No seasonal hat or item: a hat on a mask breaks the look.
const GAME_MASTER = {
  id: "game-master",
  pal: () => ({ c: "#24212c", L: "#3a3646", C: "#16141c", a: "#f0c040", A: "#a8821c", u: "#24212c", U: "#3a3646", z: "#16141c", m: "#121018", x: "#f0c040", o: "#121018", p: "#1c1a22", P: "#121018", b: "#121018" }),
  mask: true,
  body: {
    down: ["..kkUuuxxuuzkk..", ".kUkUuuzxuuzkzk.", ".kokUuuzuuuzkok.", "..kkUuuzxuuzkk.."],
    up: ["..kkuxxxxxxukk..", ".kUkUuuuuuuzkzk.", ".kokUuuuuuuzkok.", "..kkUuuuuuuzkk.."],
    side: ["...kkuuuxxukk...", "..kUuukUUkuzk...", "..kUuukookuzk...", "...kkuuuuxzk...."],
  },
  hides: ["head", "body", "hand"],
};

export const THEMES = {
  office: {
    label: "OFFICE", flat: null, hero: null, hq: null, depths: [BLAZER, CARDIGAN, null],
    marks: [{ color: "#ffd84a", pips: 3 }, { color: "#ece2c8", pips: 2 }, { color: "#7fc8ff", pips: 1 }],
  },
  arena: {
    label: "ARENA", flat: PLAYER, hero: GAME_MASTER, hq: HQ_GUARD, depths: [GUARD_SQUARE, GUARD_TRIANGLE, PLAYER],
    marks: [{ color: "#ff5aa0", pips: 3 }, { color: "#ff5aa0", pips: 2 }, { color: "#3fd0bf", pips: 1 }],
  },
};
export const THEME_CHOICES = Object.keys(THEMES);

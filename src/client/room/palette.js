// Colours: worker palettes from the name hash, the heroes, the HQ bot.
import { hash } from "../core/format.js";
import { HEADS } from "./sprites.js";

const HAIR = ["#3b2a20", "#d9a23b", "#a83232", "#2d3f8f", "#6b6b6b", "#e8d27a", "#7b3fa0", "#1f6b5a"];
const SHIRT = ["#e05a4f", "#4f8fe0", "#4fbf6b", "#e0a04f", "#9a5fe0", "#3fb6b0", "#e05fa8", "#5f6fe0", "#c0c040"];
const SKIN = ["#f6d0a8", "#e8b890", "#c08a60", "#8a5a3a"];
const PANTS = ["#3a4a6a", "#4a3a2a", "#2a2a3a", "#5a5a6a"];
const ACCENT = ["#f0d040", "#ffffff", "#3a3a48", "#e05a4f", "#4f8fe0", "#4fbf6b"];
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}
export function palette(name) {
  const h = hash(name);
  const shirt = SHIRT[h % SHIRT.length];
  const hair = HAIR[(h >>> 4) % HAIR.length], skin = SKIN[(h >>> 8) % SKIN.length], pants = PANTS[(h >>> 12) % PANTS.length], accent = ACCENT[(h >>> 16) % ACCENT.length];
  return { k: "#22202a", e: "#22202a", h: hair, H: shade(hair, 1.7), d: shade(hair, 0.6), s: skin, S: shade(skin, 0.82), c: shirt, L: shade(shirt, 1.3), C: shade(shirt, 0.7), w: "#f8f8f8", a: accent, A: shade(accent, 0.7), t: (h >>> 20) % (HEADS.length - 1), p: pants, P: shade(pants, 0.7), b: "#2f2f3a" };
}
const HERO = { k: "#22202a", e: "#22202a", h: "#4a2e1c", H: "#9a6a44", d: "#24160e", s: "#f0c49c", S: "#d8a07a", c: "#d63c3c", L: "#f06a6a", C: "#9a2626", w: "#f8f8f8", a: "#f0d040", A: "#a89028", t: HEADS.length - 1, p: "#2a2a3a", P: "#1a1a26", b: "#2f2f3a" };
// The main character, picked in SETTINGS. The default hero (YOU, labelled with HUD_OWNER on the page) keeps the
// spiky mane; the others use worker heads.
export const HEROES = [
  { name: "YOU", pal: HERO },
  { name: "MARA", pal: { ...HERO, h: "#e8d27a", H: "#fff2b8", d: "#b09a48", s: "#f6d0a8", S: "#e0b088", c: "#7fae6a", L: "#a6d08e", C: "#5a8a4a", a: "#f8f8f8", A: "#c8c8d0", t: 11, p: "#4a3a2a", P: "#2e2418" } }, // bob, cardigan
  { name: "KENJI", pal: { ...HERO, h: "#1c1c24", H: "#4a4a5e", d: "#0e0e14", s: "#e8c098", S: "#cc9e78", c: "#3a4a7a", L: "#5a6c9e", C: "#26325a", a: "#f8f8f8", A: "#c8c8d0", t: 7, p: "#3a3a44", P: "#24242c" } }, // glasses, jacket
  { name: "IVY", pal: { ...HERO, h: "#c8442c", H: "#f07a5a", d: "#82281a", s: "#f6d8b8", S: "#e0b494", c: "#f0c838", L: "#f8e070", C: "#b89020", a: "#4fbf6b", A: "#3a8a4e", t: 8, p: "#3a4a6a", P: "#26324a" } }, // pigtails, yellow top
];

export const HQBOT = { k: "#22202a", e: "#3ee08f", h: "#7a8696", H: "#c8d4e0", d: "#4a5664", s: "#c8d2dc", S: "#a8b2bc", c: "#5aa0d0", L: "#8ac4ec", C: "#3a7aa8", w: "#e0f0ff", a: "#3ee08f", A: "#2a9c64", t: 0, p: "#5a6a7a", P: "#3a4a5a", b: "#3a3a48" };

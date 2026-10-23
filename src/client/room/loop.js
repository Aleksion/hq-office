// The frame loop: FPS_FOCUSED with focus, FPS_UNFOCUSED when visible without it, paused only while hidden.
import { emit } from "../core/bus.js";
import { S } from "../core/state.js";
import { hovered, selected } from "./input.js";
import { SC, TS, ctx, cv, px } from "./canvas.js";
import { drawSprite } from "./sprites.js";
import { HQBOT } from "./palette.js";
import { hero } from "../settings/prefs.js";
import { chosenSeason, setSeason } from "./seasons.js";
import { drawAccessories, wornBy } from "./accessories.js";
import { drawEventCounter } from "./events.js";
import { workers } from "./workers.js";
import { deskCount } from "./collision.js";
import { GLYPH, drawBubble, drawLabel, drawRoom, stillOpaque, stillPicture } from "./scene.js";
import { danceMove, drawNotes, drawShadow, drawSleep, drawSparkles, isNight } from "./hero.js";
import { FPS_FOCUSED, FPS_UNFOCUSED, drawProp, drawWatchCheck, idleBrain, idleLift } from "./breakroom.js";

// At most one frame is ever waiting: either its timer or the display frame the timer asked for.
let last = performance.now();
let frameTimer = null;
let frameQueued = 0;
let frameNext = 0;
const roomVisible = () => document.visibilityState === "visible";
function scheduleFrame() {
  if (!roomVisible()) {
    clearTimeout(frameTimer);
    cancelAnimationFrame(frameQueued);
    frameTimer = null;
    frameQueued = 0;
    return;
  }
  if (frameTimer || frameQueued) return;
  frameTimer = setTimeout(() => { frameTimer = null; frameQueued = requestAnimationFrame(roomFrame); }, Math.max(0, frameNext - performance.now()));
}
function roomFrame(now) {
  frameQueued = 0;
  if (!roomVisible()) return;
  // Timed from the clock, not the frame's own timestamp, which can lag; 4 ms early lands on the display frame.
  frameNext = performance.now() + 1000 / (document.hasFocus() ? FPS_FOCUSED : FPS_UNFOCUSED) - 4;
  const dt = Math.min(0.2, (now - last) / 1000);
  last = now;
  setSeason(chosenSeason());
  drawScene(now, dt);
  scheduleFrame();
}
function drawScene(now, dt) {
  const still = stillPicture(deskCount(workers.size));
  if (!stillOpaque) ctx.clearRect(0, 0, cv.width, cv.height);
  drawRoom(now, still);
  if (S) {
    // The hero behind the counter, HQ at its terminal
    // With nothing waiting on the hero, it dances the routine, and music notes float up while it does.
    // From midnight to seven it sleeps on a bed that pulls out instead.
    const idle = !S.open.length;
    const sleeping = idle && isNight();
    if (sleeping) {
      drawSleep(now);
    } else {
      const move = idle ? danceMove(now) : null;
      if (move) drawShadow(move.air, move.dx);
      const hx = 20 * TS - 8 + (move?.dx ?? 0), hy = 2 * TS - 6 + (move?.lift ?? 0), hdir = move?.dir ?? "down", hstep = move?.step ?? 0;
      drawSprite(hero().pal, hx, hy, hdir, hstep);
      drawAccessories(hero().pal, wornBy(hero().name, true), hx, hy, hdir, hstep);
      if (move?.sparkle) drawSparkles(now);
      if (idle) drawNotes(now);
    }
    px(17 * TS, 3 * TS - 2, 6 * TS, 10, "#c84b4b");
    px(17 * TS, 3 * TS - 2, 6 * TS, 3, "#f08080");
    px(17 * TS, 3 * TS + 8, 6 * TS, 3, "#8a2a2a");
    drawEventCounter(now);
    drawLabel("YOU", 20 * TS, 3 * TS + 10, true);
    drawSprite(HQBOT, 16 * TS, 5 * TS - 6, "up", 0);
    drawLabel("HQ", 16 * TS + 8, 5 * TS + 10, true);

    const list = [...workers.values()];
    for (const w of list) if (w.brain) idleBrain(w, now, list);
    for (const w of list) {
      if (w.path.length) {
        const p = w.path[0];
        const dx = p.x - w.x, dy = p.y - w.y;
        const d = Math.hypot(dx, dy), step = 4.5 * dt;
        if (d <= step) { w.x = p.x; w.y = p.y; w.path.shift(); }
        else { w.x += (dx / d) * step; w.y += (dy / d) * step; }
        w.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
        w.t += dt;
      } else {
        w.dir = w.face;
        w.t = 0;
      }
    }
    list.sort((a, b) => a.y - b.y);
    for (const w of list) {
      const moving = w.path.length > 0;
      const step = moving ? 1 + (Math.floor(w.t * 8) % 2) : 0;
      const st = w.lane.status;
      const idleBob = !moving && st === "moving" ? (Math.floor((now + w.bob * 7) / 300) % 2) : 0;
      const ghost = st === "gone";
      const float = ghost ? Math.sin(now / 400 + w.bob) * 1.5 : 0;
      const sway = w.brain && moving ? Math.round(Math.sin(now / 110 + w.bob)) : 0;
      const sx = w.x * TS + sway, sy = w.y * TS - 6 - idleBob + float - idleLift(w, moving, now);
      if (selected === w.lane.name) {
        const r = 7 + Math.sin(now / 200);
        ctx.strokeStyle = "#d63c3c";
        ctx.lineWidth = SC;
        ctx.beginPath();
        ctx.ellipse((sx + 8) * SC, (w.y * TS + 9) * SC, r * SC, r * 0.45 * SC, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      drawSprite(w.pal, sx, sy, w.dir, step, ghost ? 0.4 : 1);
      const busyHand = !!(w.brain?.acting && (w.brain.act.kind === "coffee" || w.brain.act.kind === "snack"));
      drawAccessories(w.pal, wornBy(w.lane.name), sx, sy, w.dir, step, ghost ? 0.4 : 1, busyHand);
      if (!moving && GLYPH[st]) {
        const bounce = st === "needs_you" ? Math.abs(Math.sin(now / 220)) * 2.5 : 0;
        drawBubble(sx, sy, GLYPH[st][0], GLYPH[st][1], bounce);
      }
      drawProp(w, sx, sy);
      if (st === "waiting" && !moving) drawWatchCheck(w, sx, sy, now);
      const name = w.lane.name.length > 14 ? w.lane.name.slice(0, 13) + "…" : w.lane.name;
      drawLabel(name, sx + 8, w.y * TS + 10, selected === w.lane.name || hovered === w.lane.name || st === "needs_you");
    }
  }
  emit("room:draw", now);
}
scheduleFrame();
document.addEventListener("visibilitychange", scheduleFrame);

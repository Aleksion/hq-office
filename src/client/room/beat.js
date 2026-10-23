// The room's clock: the walking rate, the one ambient beat every idle animation steps on, and the next visible change.
//
// A presented frame costs about the same whatever it draws, so the room presents only frames that show something new.
// While anyone walks (or the hero moonwalks) it draws WALK_FPS frames a second. Otherwise every idle animation steps
// on the beat, with its clock held at its last step, and notes when it steps next; the loop sleeps until the earliest
// of those, or until new state, a click, a hover, focus or visibility wakes it. Nothing moving: no frames at all.
// 250 ms, not 500: a dance move needs two frames (on the ground, in the air), and snow falling at 500 ms jumps 4 to
// 7 pixels a step. Steady effects (screens, lights, steam, bobbing, sleep) step every second beat. The room draws the
// same with focus as without (a second screen), and not while hidden.
export const BEAT_MS = 250;
export const WALK_FPS = 10;

let due = Infinity;
// The room changes again at t.
export function changeAt(t) { if (t < due) due = t; }
// An animation's clock: now held at its last step (every `beats` beats), with its next step noted.
export function stepped(now, beats = 1) {
  const every = beats * BEAT_MS, t = Math.floor(now / every) * every;
  changeAt(t + every);
  return t;
}
// The first beat at or after t.
export const onBeat = (t) => Math.ceil(t / BEAT_MS) * BEAT_MS;
// The earliest change noted since the last call.
export function nextChange() { const d = due; due = Infinity; return d; }

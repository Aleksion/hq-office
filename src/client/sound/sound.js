// Sound: the chime for a new question, generated in the browser, and the SOUND button.
import { $ } from "../core/dom.js";
import { on } from "../core/bus.js";
import { changeSettings, settings } from "../settings/prefs.js";

export let audio = null;
// Everything is generated in the browser; no audio files. SOUND plays one chime when a new question arrives.
// It is one of the owner's settings (settings/prefs.js), kept on the server. The browser needs a click before it
// allows sound.
export let sound = settings.sound;

function ensureAudio() {
  audio = audio || new AudioContext();
  if (audio.state === "suspended") audio.resume();
  return audio;
}
export function tone(when, freq, dur, type, vol, dest) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, when);
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(dest);
  o.start(when);
  o.stop(when + dur + 0.02);
}

// The chime: three rising notes, the last one held. Plays once per new question, and only then.
export function chime() {
  if (!sound || !audio) return;
  const t = audio.currentTime;
  [659, 988, 1319].forEach((f, i) => tone(t + i * 0.09, f, i === 2 ? 0.45 : 0.16, "triangle", 0.12, audio.destination));
}

function renderSoundButtons() {
  $("alerts").textContent = sound ? "SOUND ON" : "SOUND OFF";
}
$("alerts").addEventListener("click", () => {
  sound = !sound;
  changeSettings({ sound });
  if (sound) { ensureAudio(); chime(); }
  renderSoundButtons();
});
on("settings", (s) => { sound = s.sound; renderSoundButtons(); });
// A saved setting may be on from last time; the first click anywhere unlocks audio for it.
document.addEventListener("pointerdown", () => { if (sound) ensureAudio(); }, { once: true });
renderSoundButtons();

// Sound: the question and message chimes, generated in the browser, and the SOUND button.
import { $ } from "../core/dom.js";
import { on } from "../core/bus.js";
import { changeSettings, settings } from "../settings/prefs.js";

export let audio = null;
// Everything is generated in the browser; no audio files. SOUND plays a chime when a new question or message arrives.
// It is one of the owner's settings (settings/prefs.js), kept on the server. The browser needs a click before it
// allows sound.
export let sound = settings.sound;

function ensureAudio() {
  audio = audio || new AudioContext();
  if (audio.state === "suspended") audio.resume();
  return audio;
}
// Two chimes, picked by ear by the owner, in different instruments so they are told apart at once:
// a new question is a marimba call (long-short-long, rising), a new message from HQ is a bubble pop and a bell.
function voice(t, f, type, peak, decay, sweepTo) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + 0.06);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + decay + 0.05);
}
// A marimba note: a warm fundamental with its fourth harmonic, short.
function marimba(t, f, vol) {
  voice(t, f, "sine", vol, 0.35);
  voice(t, f * 4, "sine", vol * 0.35, 0.12);
}
// A bell: inharmonic partials with different decays, the way a struck metal bar rings.
function bell(t, f, vol, decay) {
  for (const [ratio, gain, d] of [[1, 1, 1], [2.76, 0.42, 0.55], [5.4, 0.2, 0.3], [8.93, 0.08, 0.18]]) voice(t, f * ratio, "sine", vol * gain, decay * d);
}

// The question chime: "dum, da-DUM". Plays once per new question, and only then.
export function chime() {
  if (!sound || !audio) return;
  const t = audio.currentTime + 0.02;
  marimba(t, 784, 0.32);
  marimba(t + 0.2, 988, 0.3);
  marimba(t + 0.29, 1175, 0.34);
}
// The message chime: a soft upward pop, then one clear bell. Plays once per new message from HQ.
export function messageChime() {
  if (!sound || !audio) return;
  const t = audio.currentTime + 0.02;
  voice(t, 520, "sine", 0.22, 0.09, 1300);
  bell(t + 0.07, 1568, 0.2, 0.9);
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

// How an HQ agent talks to the owner: the one text that `hud guide` prints, the plugin types into a new HQ session,
// and (as one line) the server adds to every message it types into HQ. Edit it here and nowhere else.

export const GUIDE = `HQ Office guidance (from the hq-office herdr plugin; \`hud guide\` prints it again):
The owner reads the HQ Office page (the HUD), usually on a second screen, and does not read agent terminals. Anything meant for the owner goes through the HUD, or it is never seen.
- Answer every note, answer or reply from the owner through the HUD, never only here: \`hud tell --title T [--body B] [--lane L]\` for information, \`hud comment ID TEXT\` on an open question.
- A question for the owner is an ask: \`hud ask --title T [--body B] [--opt A --opt B] [--rec A]\`. Change it in place with \`hud update ID ...\` or \`hud comment ID TEXT\`; do not withdraw and repost.
- Work in flight is tracked on the board: \`hud track ISSUE --lane L --pr N\`. Start every sweep with \`hud board\`, and \`hud inbox\` for what the owner sent (\`hud ack\` once acted on).
- Lanes file what they need from you as requests: drain them with \`hud req next\` (or \`hud req list\`), and answer with \`hud req answer ID "text"\`, which types the answer into the lane's pane and closes the request. A request left open is a lane waiting on you.
- This terminal is for your own work.`;

// One line, so it never swamps the message it follows.
export const HINT = "Reply through the HUD (hud tell --title T, or hud comment ID TEXT on an open question); the owner does not read this terminal.";

// A message for HQ with the reply reminder appended, unless HUD_HQ_HINT=0.
export function withHint(text: string, env: Record<string, string | undefined> = process.env) {
  return env.HUD_HQ_HINT === "0" ? text : `${text}\n${HINT}`;
}

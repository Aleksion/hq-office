# Floors and the scope

A floor is a lane under HQ that directs leads. With a flat or two-level tree there is one floor and the page is the
page it always was. The rule is one pure function, `floorsOf` in `src/lane-tree.ts`: a lane straight under HQ heads a
floor when a lane sits at depth 3 or deeper under it. Its whole subtree is on its floor; every other lane is on HQ's.

## The scope

`src/client/core/scope.js` holds `{ floor, agent, all }` and emits `"scope"` on the bus on every change. Every list and
count reads `view()` and builds its numbers with the pure functions in `src/client/core/floors.js`; none calls another
panel. The scope is kept in `sessionStorage` (`hq-scope`) and checked against the lanes when read back, so a reload
keeps it and a new tab starts unscoped.

## Choosing an agent

A click on a worker (`"worker"` on the room's bus), a question's lane tag, ANSWER on the card and the BLOCKED box all
end in `chooseAgent(name, { jump: true })`. The card shows `scope().agent`; `floors/index.js` rings that worker on its
floor; the question panel switches to QUESTIONS and flashes the lane's first question. The chip, the border and the
"+N FROM OTHER AGENTS · SHOW ALL" line say that the lists are narrowed. Escape and the chip's ✕ go out one level
(`escapeAction`); a room on the stage, SETTINGS, a dialog or a text field keep the key.

## Decisions the code carries

- **Everything follows the scope** (the owner, on the phone tabs: "When I click a floor everything is scoped to that
  floor. Eg queue and messages as well."). WAITING ON YOU, the questions, the messages and their unread counts, the
  FROM HQ list and MARK ALL READ all follow it. This replaces the earlier decision that the MESSAGES badge counts every
  room; the line "+N ON OTHER FLOORS" counts the rest.
- **Today's tab row stays.** Questions and messages keep the tabs they have.
- **Tell and messages go to HQ** in every scope until other generals exist on the server (`tellRecipient`).

## Not scoped

They are about the whole installation or the owner, not one floor's work: the tab title and the chimes, BANK, the
BLOCKED box, HQ ISN'T RECEIVING, ACCOUNTS, MACHINES, SENT & ANSWERED and SECRETS.

## Rules the tests keep

- Marking read in a scope marks only what is in that scope (`read-all` takes `{ floor, lane }`; `marksRead` on the page).
- With no scope set, every count and list is what it was before floors (`counts`, `readAllBody`).
- A scope that no longer holds (a lane gone, a floor gone, one floor) is dropped on every state (`normalizeScope`).

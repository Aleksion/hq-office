// The page's shared state: S, the last /api/state, and CONFIG from the server. Leaf module; boot.js sets them.
export let S = null;
// Set from the server's config on every load: owner name for the room sign, and the links to GitHub and Linear.
export let CONFIG = { owner: "", githubRepo: "", linearWorkspace: "" };
export function setS(v) { return (S = v); }
export function setCONFIG(v) { return (CONFIG = v); }

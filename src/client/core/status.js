// Lane status labels and colours. A contract shared by the card and anything else that names a status.
export const STATUS_TEXT = {
  blocked: ["Blocked on a prompt", "#b01e1e"], // blocked-prompts: its agent waits at a prompt in its herdr pane
  needs_you: ["Waiting on you", "#d63c3c"],
  hq_turn: ["Waiting on HQ", "#e0901e"],
  stale: ["Waiting on HQ 15+ min", "#c0501e"],
  gone: ["Agent gone", "#6a6a82"],
  moving: ["Working", "#2f9e57"],
  waiting: ["Waiting on CI / other", "#3c6fd6"],
  parked: ["Parked", "#6a6a82"],
  done: ["Done", "#2f9e57"],
};

// Routes for the owner's settings. The router loads every file in this folder; see src/server/router.ts.
//   POST /api/settings { settings: { key: value | null, ... }, ifEmpty?: true }  ->  { settings }
import { json } from "../json.ts";
import { changeSettings, getSettings } from "../settings.ts";
import type { Route } from "../router.ts";

const routes: Route[] = [
  { method: "GET", path: "/api/settings", handle: () => json({ settings: getSettings() }) },
  { method: "POST", path: "/api/settings", handle: ({ body }) => ({ settings: changeSettings(body.settings, { ifEmpty: body.ifEmpty === true }) }) },
];
export default routes;

// Writes to the server (POST with the x-hud header).
export async function post(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-hud": "1" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

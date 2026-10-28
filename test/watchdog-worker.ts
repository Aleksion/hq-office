// The watchdog's clock (see watchdog.ts), on its own thread so a blocked test cannot stop it.
setTimeout(() => {
  console.error(`\nbun test ran past ${Number(process.env.HUD_TEST_LIMIT_MS) / 60_000} min: stopping it and what it started (HUD_TEST_LIMIT_MIN changes the limit)`);
  Bun.spawnSync(["pkill", "-TERM", "-P", String(process.pid)], { timeout: 5000 });
  process.kill(process.pid, "SIGKILL");
}, Number(process.env.HUD_TEST_LIMIT_MS));

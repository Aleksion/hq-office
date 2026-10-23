#!/usr/bin/env bun
// A stand-in for `gh pr view N --json ...`: prints the fixture for PR N from the JSON file in FAKE_GH_DATA.
// Each call appends the PR number to FAKE_GH_DATA.calls, so tests can count fetches.
import { appendFileSync, readFileSync } from "node:fs";

const [, , cmd, sub, num] = process.argv;
const file = process.env.FAKE_GH_DATA!;
if (cmd !== "pr" || sub !== "view") {
  console.error("fake gh: only pr view");
  process.exit(2);
}
appendFileSync(`${file}.calls`, `${num}\n`);
const pr = JSON.parse(readFileSync(file, "utf8"))[num];
if (!pr) {
  console.error(`no pull requests found for ${num}`);
  process.exit(1);
}
console.log(JSON.stringify(pr));

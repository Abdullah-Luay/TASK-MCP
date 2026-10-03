// Project files: .sas-task.auth.json (private login) and
// .sas-task.auth.example.json (committed template for it).
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const AUTH_FILE = ".sas-task.auth.json";
export const AUTH_EXAMPLE_FILE = ".sas-task.auth.example.json";

const AUTH_TEMPLATE = { email: "", password: "" };

// The project root: the nearest folder (upwards) with an auth file, else the git root, else `start`.
export function findProjectRoot(start) {
  const from = resolve(start);
  for (const marker of [AUTH_FILE, ".git"]) {
    let dir = from;
    for (;;) {
      if (existsSync(join(dir, marker))) return dir;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return from;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${e.message}`);
  }
}

function writeJsonIfMissing(file, data) {
  if (existsSync(file)) return false;
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  return true;
}

// Make sure the private auth file can never be committed.
function ignoreAuthFile(dir) {
  const gitignore = join(dir, ".gitignore");
  const current = existsSync(gitignore) ? readFileSync(gitignore, "utf8") : "";
  if (current.split(/\r?\n/).some((l) => l.trim() === AUTH_FILE)) return false;
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  appendFileSync(gitignore, `${prefix}# SAS task manager login (private)\n${AUTH_FILE}\n`);
  return true;
}

// Create whichever setup files are missing.
export function createTemplates(dir) {
  writeJsonIfMissing(join(dir, AUTH_EXAMPLE_FILE), AUTH_TEMPLATE);
  ignoreAuthFile(dir);
  writeJsonIfMissing(join(dir, AUTH_FILE), AUTH_TEMPLATE);
}

// Load the auth file and list anything still empty.
export function loadProject(dir) {
  const auth = readJson(join(dir, AUTH_FILE));
  const missing = ["email", "password"].filter((k) => !auth[k]).map((k) => `${AUTH_FILE} → ${k}`);
  return { auth, missing };
}

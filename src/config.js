// Project files: .sas-task.json (committed), .sas-task.auth.json (private)
// and .sas-task.auth.example.json (committed template for the private one).
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const CONFIG_FILE = ".sas-task.json";
export const AUTH_FILE = ".sas-task.auth.json";
export const AUTH_EXAMPLE_FILE = ".sas-task.auth.example.json";

const CONFIG_TEMPLATE = { projectId: "", teamId: "" };
const AUTH_TEMPLATE = { email: "", password: "" };

// The project root is the nearest folder (upwards) that has .sas-task.json.
export function findProjectRoot(start) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, CONFIG_FILE))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
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

// Create whichever setup files are missing. Returns the names it created.
export function createTemplates(dir) {
  const created = [];
  if (writeJsonIfMissing(join(dir, CONFIG_FILE), CONFIG_TEMPLATE)) created.push(CONFIG_FILE);
  if (writeJsonIfMissing(join(dir, AUTH_EXAMPLE_FILE), AUTH_TEMPLATE)) created.push(AUTH_EXAMPLE_FILE);
  if (ignoreAuthFile(dir)) created.push(".gitignore entry");
  if (writeJsonIfMissing(join(dir, AUTH_FILE), AUTH_TEMPLATE)) created.push(AUTH_FILE);
  return created;
}

// Load both files and list anything still empty.
export function loadProject(dir) {
  const config = readJson(join(dir, CONFIG_FILE));
  const authPath = join(dir, AUTH_FILE);
  const auth = existsSync(authPath) ? readJson(authPath) : {};
  const missing = [
    // projectId is optional: it's only the suggested default when the agent asks.
    ...["teamId"].filter((k) => !config[k]).map((k) => `${CONFIG_FILE} → ${k}`),
    ...["email", "password"].filter((k) => !auth[k]).map((k) => `${AUTH_FILE} → ${k}`),
  ];
  return { config, auth, missing };
}

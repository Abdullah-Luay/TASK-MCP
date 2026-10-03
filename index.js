#!/usr/bin/env node
// Entry point for the SAS task manager MCP server.
import { readFileSync } from "node:fs";
import { startServer } from "./src/server.js";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
await startServer(version);

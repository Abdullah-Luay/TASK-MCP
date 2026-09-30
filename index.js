#!/usr/bin/env node
// MCP server that logs completed work as tasks in the SAS task manager.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (process.env.TASK_APP_URL || "https://task-manager.sasconsults.com").replace(/\/$/, "");
const DEFAULT_CATEGORY_ID = "6f1b0c3a-0001-4000-8000-000000000001";
const DEFAULT_PRIORITY_ID = "6f1b0c3a-0002-4000-8000-000000000004";

// Optional per-repo settings: a .sas-task.json in the project folder, e.g.
// { "projectId": "...", "teamId": "..." }
function repoConfig() {
  const file = join(process.cwd(), ".sas-task.json");
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function getToken() {
  const raw = process.env.TASK_APP_TOKEN;
  if (!raw) throw new Error("TASK_APP_TOKEN is not set. Add it to the MCP server's env settings.");
  return raw.replace(/^Bearer\s+/i, "").trim();
}

function decodeJwt(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

function errorResult(text) {
  return { isError: true, content: [{ type: "text", text }] };
}

const server = new McpServer({ name: "sas-task-manager", version: "1.0.0" });

server.registerTool(
  "create_task",
  {
    title: "Log work as a task",
    description:
      "Create a task in the SAS task manager for work the user has completed. " +
      "When you finish a piece of work, ask the user whether to log it; call this tool only after they say yes. " +
      "Write a short title and a description of what was done (include commit hashes if any).",
    inputSchema: {
      title: z.string().min(1).describe("Short task title, e.g. 'Fix outer join in AssignmentRespondView'"),
      description: z.string().default("").describe("What was done and why; list commits/files touched"),
      minutes: z.number().int().positive().optional().describe("Time spent in minutes, if known"),
      projectId: z.string().optional().describe("Override the task-manager project ID"),
    },
  },
  async ({ title, description, minutes, projectId }) => {
    let token;
    try {
      token = getToken();
    } catch (e) {
      return errorResult(e.message);
    }
    const claims = decodeJwt(token);
    if (claims.exp && claims.exp * 1000 < Date.now()) {
      return errorResult("TASK_APP_TOKEN has expired. Copy a fresh token from the browser and update the MCP config.");
    }

    const cfg = repoConfig();
    const project = projectId || cfg.projectId || process.env.TASK_APP_PROJECT_ID;
    const teamId = cfg.teamId || process.env.TASK_APP_TEAM_ID;
    const assigneeId = process.env.TASK_APP_ASSIGNEE_ID || claims.sub;
    if (!project) return errorResult("No project ID. Set TASK_APP_PROJECT_ID or add .sas-task.json to the repo.");
    if (!teamId) return errorResult("No team ID. Set TASK_APP_TEAM_ID or add teamId to .sas-task.json.");

    const payload = {
      title,
      description,
      assigneeId,
      teamId,
      categoryId: cfg.categoryId || process.env.TASK_APP_CATEGORY_ID || DEFAULT_CATEGORY_ID,
      priorityId: cfg.priorityId || process.env.TASK_APP_PRIORITY_ID || DEFAULT_PRIORITY_ID,
      dueDate: null,
      epicId: null,
      originalEstimateMinutes: minutes ?? null,
      parentTaskId: null,
    };

    const url = `${BASE_URL}/api/projects/${encodeURIComponent(project)}/tasks`;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return errorResult(`Could not reach ${BASE_URL}: ${e.message}`);
    }

    const body = (await res.text()).slice(0, 1000);
    if (res.status === 401 || res.status === 403) {
      return errorResult(`${res.status}: token rejected (expired or wrong). Update TASK_APP_TOKEN. ${body}`);
    }
    if (!res.ok) return errorResult(`HTTP ${res.status}: ${body}`);
    return { content: [{ type: "text", text: `Task created: "${title}"\n${body}` }] };
  }
);

await server.connect(new StdioServerTransport());

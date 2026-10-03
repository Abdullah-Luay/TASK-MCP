// MCP server: sets up a project's config files and logs completed work as tasks.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { api } from "./api.js";
import { findProjectRoot, createTemplates, loadProject, CONFIG_FILE, AUTH_FILE, AUTH_EXAMPLE_FILE } from "./config.js";
import { DROPDOWNS, loadLookups, projectEpics } from "./lookups.js";

// "1h 30m", "90m", "2h", "1.5h" or a plain number of minutes -> minutes.
export function parseEstimate(value) {
  const s = String(value).trim().toLowerCase();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/);
  if (!m || (!m[1] && !m[2])) return null;
  const minutes = Math.round(Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0));
  return minutes > 0 ? minutes : null;
}

function text(t) {
  return { content: [{ type: "text", text: t }] };
}

function errorResult(t) {
  return { isError: true, content: [{ type: "text", text: t }] };
}

// Find (or create) the project's setup files. Returns { project } or { error }.
function openProject(projectDir) {
  const start = projectDir || process.cwd();
  const dir = findProjectRoot(start) ?? start;
  try {
    createTemplates(dir); // Also creates a teammate's own auth file on first use.
    const project = loadProject(dir);
    if (!project.missing.length) return { project };
    return {
      error:
        `The task app isn't set up for this project yet. Ask the user to fill in:\n` +
        project.missing.map((m) => `  - ${m}`).join("\n") +
        `\n\nFiles are in ${dir}. ${AUTH_FILE} is private (git-ignored); ` +
        `${CONFIG_FILE} and ${AUTH_EXAMPLE_FILE} should be committed. Try again once they're filled in.`,
    };
  } catch (e) {
    return { error: e.message };
  }
}

function findOption(list, value) {
  const v = String(value).toLowerCase();
  return list.find((o) => o.id === value || o.name.toLowerCase() === v);
}

function formatList(key, list, extra = "") {
  const d = DROPDOWNS[key];
  const tags = [d.required ? "required" : "optional", d.multiple ? "pick several" : "pick one"];
  const names = list.map((o) => (o.suggested ? `${o.name} (suggested)` : o.name));
  return `${d.label} [${key}] (${tags.join(", ")}): ${names.join(" / ") || "(none available)"}${extra}`;
}

const projectDirParam = z
  .string()
  .optional()
  .describe("Absolute path of the project the user is working in (your current working directory)");

const pick = (key) => `${DROPDOWNS[key].label}: an option name from get_task_options`;

export async function startServer(version) {
  const server = new McpServer({ name: "sas-task-manager", version });

  server.registerTool(
    "get_task_options",
    {
      title: "List task dropdown options",
      description:
        "Fetch the current choices for every task dropdown (project, epic, category, priority, labels) " +
        "from the task app, so you can ask the user. Pass `project` once the user has picked one to narrow " +
        "epics to that project where possible.",
      inputSchema: {
        project: z.string().optional().describe("Project name or ID the user picked"),
        projectDir: projectDirParam,
      },
    },
    async ({ project: projectArg, projectDir }) => {
      try {
        const lookups = await loadLookups();
        const root = findProjectRoot(projectDir || process.cwd());
        const usualId = root ? loadProject(root).config.projectId : null;
        const usual = lookups.projects.find((p) => p.id === usualId);
        const chosen = projectArg ? findOption(lookups.projects, projectArg) : null;
        if (projectArg && !chosen) {
          return errorResult(`Project "${projectArg}" doesn't exist.\n\n${formatList("project", lookups.projects)}`);
        }
        const epics = projectEpics(lookups, chosen?.id);
        return text(
          [
            formatList("project", lookups.projects, usual ? `\n  → This repo's usual project: ${usual.name}` : ""),
            formatList("epic", epics),
            formatList("category", lookups.categories),
            formatList("priority", lookups.priorities),
            formatList("labels", lookups.labels),
          ].join("\n")
        );
      } catch (e) {
        return errorResult(`Could not load options: ${e.message}`);
      }
    }
  );

  server.registerTool(
    "create_task",
    {
      title: "Upload work as a task",
      description:
        "Create a task in the SAS task manager for work the user has completed. Only call this after the user " +
        "says yes to logging it. Steps: (1) write a short title and a description of what was done, including " +
        "commit hashes; (2) call get_task_options and ASK THE USER for project, epic, category, " +
        "priority, labels and the time spent. Offer the suggested options, never pick for them; " +
        "(3) call this tool. If the project isn't set up yet, this tool creates " +
        "the setup files and tells you what the user must fill in.",
      inputSchema: {
        title: z.string().min(1).describe("Short task title, e.g. 'Fix outer join in AssignmentRespondView'"),
        description: z.string().default("").describe("What was done and why; list commits/files touched"),
        project: z.string().describe(pick("project")),
        epic: z.string().optional().describe(`${pick("epic")}. Omit for none`),
        category: z.string().describe(pick("category")),
        priority: z.string().optional().describe(pick("priority")),
        labels: z.array(z.string()).optional().describe(`${pick("labels")}; several allowed`),
        estimate: z.string().optional().describe("Time spent as the user says it: '1h 30m', '45m', '2h'"),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Due date as YYYY-MM-DD, if the user gives one"),
        projectDir: projectDirParam,
      },
    },
    async (args) => {
      const { project: setup, error } = openProject(args.projectDir);
      if (error) return errorResult(error);
      const { config, auth } = setup;

      const minutes = args.estimate ? parseEstimate(args.estimate) : null;
      if (args.estimate && !minutes) {
        return errorResult(`Couldn't read the estimate "${args.estimate}". Use a form like "1h 30m", "45m" or "2h".`);
      }

      try {
        const lookups = await loadLookups();
        const problems = [];
        const resolve = (key, value, list) => {
          if (value === undefined || value === "") {
            if (DROPDOWNS[key].required) problems.push(`${DROPDOWNS[key].label} is required.`);
            return null;
          }
          const hit = findOption(list, value);
          if (!hit) problems.push(`${DROPDOWNS[key].label} "${value}" doesn't exist. Options: ${list.map((o) => o.name).join(", ")}`);
          return hit?.id ?? null;
        };

        const projectId = resolve("project", args.project, lookups.projects);
        if (!projectId) return errorResult(problems.join("\n"));
        const epics = projectEpics(lookups, projectId);

        const body = {
          title: args.title,
          description: args.description,
          assigneeId: auth.userId,
          teamId: config.teamId,
          dueDate: args.dueDate ?? null,
          originalEstimateMinutes: minutes,
          parentTaskId: null,
          [DROPDOWNS.epic.field]: resolve("epic", args.epic, epics),
          [DROPDOWNS.category.field]: resolve("category", args.category, lookups.categories),
          [DROPDOWNS.priority.field]: resolve("priority", args.priority, lookups.priorities),
        };
        const labelIds = (args.labels ?? []).map((l) => resolve("labels", l, lookups.labels)).filter(Boolean);
        if (labelIds.length) body[DROPDOWNS.labels.field] = labelIds;
        if (problems.length) return errorResult(problems.join("\n"));

        const { data: task } = await api(auth, "POST", `/api/projects/${encodeURIComponent(projectId)}/tasks`, body);

        const summary = [
          ["Project", args.project],
          ["Epic", args.epic],
          ["Category", args.category],
          ["Priority", args.priority],
          ["Labels", args.labels?.join(", ")],
          ["Estimate", minutes && args.estimate],
          ["Due", args.dueDate],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
        const ref = task?.key || task?.code || task?.id;
        return text(`Task created: "${args.title}"${ref ? ` (${ref})` : ""}. ${summary}`);
      } catch (e) {
        return errorResult(`Could not create task: ${e.message}`);
      }
    }
  );

  await server.connect(new StdioServerTransport());
}

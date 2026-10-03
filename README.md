# SAS Task MCP

Upload your Claude Code work as tasks to the [SAS task manager](https://task-manager.sasconsults.com),
without leaving the editor.

When you finish some work, tell Claude **"upload this as a task"**. Claude writes the title and
description, asks you which project, epic, category, priority and labels to use (the lists come
live from the task manager), and creates the task assigned to you.

## 1. Install (once per computer)

Requires Node.js 18+ and git.

```bash
claude mcp add sas-tasks --scope user -- npx -y github:Abdullah-Luay/TASK-MCP
```

On Windows (PowerShell; the quotes around `--` are needed, or PowerShell drops it):

```powershell
claude mcp add sas-tasks --scope user '--' cmd /c npx -y github:Abdullah-Luay/TASK-MCP
```

On Windows (Command Prompt or Git Bash):

```bash
claude mcp add sas-tasks --scope user -- cmd /c npx -y github:Abdullah-Luay/TASK-MCP
```

Restart Claude Code, then run `claude mcp list` and check that `sas-tasks` is connected.

## 2. Fill in the config (once per project)

The first time you ask Claude to upload a task in a project, it creates these files in the
project root and asks you to fill them in:

| File | Contains | Commit it? |
|---|---|---|
| `.sas-task.json` | The team, and the project this repo usually belongs to | **Yes**, shared by the team |
| `.sas-task.auth.example.json` | An empty template of the auth file | **Yes**, so teammates see the format |
| `.sas-task.auth.json` | **Your** email and password | **Never**. It's added to `.gitignore` automatically |

`.sas-task.json`:

```json
{
  "projectId": "optional: the project Claude suggests first",
  "teamId": "your team's ID"
}
```

`.sas-task.auth.json`:

```json
{
  "email": "you@sasconsults.com",
  "password": "your task-manager password"
}
```

**Where to find the IDs:** in the task manager, press **F12**, open the **Network** tab and create any
task. In the `tasks` request's **Payload**, `teamId` is your team. The project ID is in the request URL: `.../api/projects/<projectId>/tasks`.

Teammates who clone a repo that's already set up only need to fill in their own
`.sas-task.auth.json`. Claude creates it for them on first use.

## 3. Use it

Just say it when you're done:

> upload this as a task

Claude will:

1. Write the title and a description of what was done (with commit hashes).
2. Ask which **project** (suggesting this repo's usual one).
3. Ask for **epic**, **category**, **priority**, **labels** and **time spent**
   (e.g. `1h 30m`), suggesting the defaults.
4. Create the task, assigned to you (your user is taken from your login), and tell you its ID.

## How it works

| Tool | What it does |
|---|---|
| `get_task_options` | Fetches the dropdown lists live from the task manager |
| `create_task` | Creates the task with your choices |

- **Login:** the server signs in with your auth file and caches the session in
  `~/.sas-task-mcp/sessions.json`, renewing it automatically. If your password changes, update the
  auth file.
- **Dropdowns:** fetched from the task manager's lookup endpoint (`src/lookups.js`) and cached for
  5 minutes, so new projects, categories or labels show up without updating the MCP.

## Troubleshooting

| Message | Fix |
|---|---|
| "The task app isn't set up for this project yet" | Fill in the fields it lists, then ask again |
| "Login failed … wrong email or password" | Check `.sas-task.auth.json` |
| "… doesn't exist. Options: …" | Pick one of the listed options |
| `sas-tasks` not in `claude mcp list` | Re-run the install command and restart Claude Code |
| `error: unknown option '-y'` when installing | You're in PowerShell: write `'--'` with quotes, or use `claude.cmd` instead of `claude` |

## Development

```bash
git clone https://github.com/Abdullah-Luay/TASK-MCP.git
cd TASK-MCP
npm install
node index.js   # runs the MCP server on stdio
```

| File | Purpose |
|---|---|
| `src/server.js` | MCP tools |
| `src/lookups.js` | Dropdown definitions and the lookup endpoint |
| `src/config.js` | Project and auth files |
| `src/api.js` | Login, session cache and API requests |

Optional environment variables: `TASK_APP_URL` (defaults to the production app) and
`TASK_APP_SESSION_FILE`.

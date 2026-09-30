# sas-task-mcp

MCP server that lets Claude Code log your completed work as tasks in the SAS task manager
(https://task-manager.sasconsults.com). When Claude finishes work, it asks you whether to log it.
If you say yes, it creates the task under your account.

## Setup

Requires Node.js 18+.

```bash
git clone https://github.com/Abdullah-Luay/TASK-MCP.git
cd TASK-MCP
npm install
```

### 1. Get your values from the task manager

Open the task manager in the browser, press **F12**, go to the **Network** tab, and create any task.
Click the `tasks` request:

- **Request URL** `.../api/projects/<PROJECT_ID>/tasks` gives you `TASK_APP_PROJECT_ID`
- **Payload** `teamId` gives you `TASK_APP_TEAM_ID`
- **Request Headers** `Authorization: Bearer <TOKEN>` gives you `TASK_APP_TOKEN` (copy only the part after `Bearer `)

Your user ID (assignee) is read from the token automatically.

### 2. Register it with Claude Code (all projects)

```bash
claude mcp add sas-tasks --scope user \
  -e TASK_APP_TOKEN=<your token> \
  -e TASK_APP_PROJECT_ID=<project id> \
  -e TASK_APP_TEAM_ID=<team id> \
  -- node "/full/path/to/TASK-MCP/index.js"
```

Then run `claude mcp list` and check that `sas-tasks` shows as connected.

The token is stored only in your own `~/.claude.json`. Never commit it or share it.

## Settings

| Variable | Required | Notes |
|---|---|---|
| `TASK_APP_TOKEN` | yes | Your login token. If Claude reports "expired", copy a fresh one and re-run `claude mcp add` |
| `TASK_APP_PROJECT_ID` | yes* | Default project for tasks |
| `TASK_APP_TEAM_ID` | yes* | Your team ID |
| `TASK_APP_ASSIGNEE_ID` | no | Defaults to the user ID in your token |
| `TASK_APP_CATEGORY_ID` | no | Defaults to the standard category |
| `TASK_APP_PRIORITY_ID` | no | Defaults to the standard priority |
| `TASK_APP_URL` | no | Defaults to `https://task-manager.sasconsults.com` |

\* Can be set per repo instead (see below).

### Different project per repo

If a code repo belongs to a different task-manager project, add a `.sas-task.json` to that repo's root:

```json
{ "projectId": "<project id>", "teamId": "<team id>" }
```

It overrides the env values when Claude Code is working in that repo.

## Usage

Just work with Claude Code as usual. When a piece of work is done, Claude asks
"Log this in the task app?". Say yes and the task is created. You can also ask directly:
"log this as a task".

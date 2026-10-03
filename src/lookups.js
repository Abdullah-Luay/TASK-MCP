// Dropdown data for the task form, fetched live from the task app's public taxonomy endpoint.
import { getPublic } from "./api.js";

// Response: { data: { projects, categories, priorities, labels, epics, ... } }, each a list
// of { id, name } (categories/priorities also have isDefault).
// If epics include a projectId, they're filtered to the chosen project.
// Sprints are not used: tasks always go to the backlog.
export const LOOKUP_ENDPOINT = "/api/public/taxonomy";
const CACHE_MS = 5 * 60_000;

// The task form's dropdowns. `field` is the key sent in the create-task request.
export const DROPDOWNS = {
  project: { label: "Project", field: "projectId", required: true },
  epic: { label: "Epic", field: "epicId", perProject: true },
  category: { label: "Category", field: "categoryId", required: true },
  priority: { label: "Priority", field: "priorityId" },
  labels: { label: "Labels", field: "labelIds", multiple: true }, // TODO(backend): confirm field name
};

function toList(list) {
  return (Array.isArray(list) ? list : []).map((it) => ({
    id: String(it.id),
    name: String(it.name ?? it.id),
    projectId: it.projectId ? String(it.projectId) : null,
    suggested: Boolean(it.isDefault || it.isActive),
  }));
}

let cache = null;

export async function loadLookups() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const raw = await getPublic(LOOKUP_ENDPOINT);
  const data = Object.fromEntries(
    ["projects", "categories", "priorities", "labels", "epics"].map((k) => [k, toList(raw?.[k])])
  );
  cache = { at: Date.now(), data };
  return data;
}

// Epics for one project (all of them if the API doesn't say which project they belong to).
export function projectEpics(lookups, projectId) {
  return lookups.epics.filter((it) => !it.projectId || it.projectId === projectId);
}

import {
  contentHashOf, extractLinks, extractTags,
  type BirdEyeStore, type MemoryRecord, type TaskRecord, type Vault,
} from '@birdeye/core';

const SEARCH_LIMIT = 20;
const TASK_STATUSES = ['todo', 'claimed', 'running', 'done', 'failed'] as const;

export interface ToolDeps { store: BirdEyeStore; vault: Vault; }

export interface BirdEyeTools {
  memory_search: (args: { query: string }) => MemoryRecord[];
  memory_save: (args: { title: string; body: string; tags?: string[] }) => { id: string };
  task_list: () => TaskRecord[];
  task_claim: (args: { taskId: string; harness: string }) => TaskRecord;
  task_update: (args: { taskId: string; status: string; note?: string }) => TaskRecord;
  vault_get: (args: { key: string }) => string;
}

/** Pure tool handlers — the MCP server wraps these; tests call them directly. */
export function createTools(deps: ToolDeps): BirdEyeTools {
  const findTask = (taskId: string): { tasks: TaskRecord[]; task: TaskRecord } => {
    const tasks = deps.store.loadTasks();
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error(`task "${taskId}" not found`);
    return { tasks, task };
  };

  return {
    memory_search({ query }) {
      const needle = query.trim().toLowerCase();
      if (!needle) return [];
      return deps.store.canonicalMemories()
        .filter((memory) =>
          memory.title.toLowerCase().includes(needle) ||
          memory.body.toLowerCase().includes(needle) ||
          memory.tags.some((tag) => tag.toLowerCase().includes(needle)))
        .slice(0, SEARCH_LIMIT);
    },

    memory_save({ title, body, tags }) {
      if (!title.trim() || !body.trim()) throw new Error('title and body are required');
      const hash = contentHashOf(body);
      const record: MemoryRecord = {
        id: `generic:${hash.slice(0, 12)}`,
        title: title.trim(), body: body.trim(), type: 'note',
        sourceHarness: 'generic', sourceFile: 'mcp-gateway',
        createdAt: new Date().toISOString(),
        tags: [...new Set([...(tags ?? []), ...extractTags(body)])],
        links: extractLinks(body),
        contentHash: hash,
      };
      deps.store.addMemory(record);
      return { id: record.id };
    },

    task_list() {
      return deps.store.loadTasks();
    },

    task_claim({ taskId, harness }) {
      const { tasks, task } = findTask(taskId);
      task.status = 'claimed';
      task.assignedHarness = harness as TaskRecord['assignedHarness'];
      task.updatedAt = new Date().toISOString();
      deps.store.saveTasks(tasks);
      return task;
    },

    task_update({ taskId, status, note }) {
      if (!(TASK_STATUSES as readonly string[]).includes(status)) {
        throw new Error(`invalid status "${status}" — expected one of ${TASK_STATUSES.join(', ')}`);
      }
      const { tasks, task } = findTask(taskId);
      task.status = status as TaskRecord['status'];
      task.updatedAt = new Date().toISOString();
      const latestRun = task.runs[task.runs.length - 1];
      if (note && latestRun) latestRun.output += `\n[update] ${note}`;
      deps.store.saveTasks(tasks);
      return task;
    },

    vault_get({ key }) {
      const value = deps.vault.get(key);
      if (value === null) throw new Error(`no secret named "${key}" in the BirdEye vault`);
      return value;
    },
  };
}

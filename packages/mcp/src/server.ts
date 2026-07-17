import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolDeps } from './tools.ts';
import { createTools } from './tools.ts';

function text(value: unknown): { content: [{ type: 'text'; text: string }] } {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function errorText(error: unknown): { content: [{ type: 'text'; text: string }]; isError: true } {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: `error: ${message}` }], isError: true };
}

/** The BirdEye MCP gateway: shared memory, shared task queue, shared vault — for every harness. */
export function createMcpServer(deps: ToolDeps): McpServer {
  const tools = createTools(deps);
  const server = new McpServer({ name: 'birdeye', version: '0.1.0' });

  server.tool(
    'memory_search',
    'Search the shared BirdEye memory (unified across all agent harnesses on this machine).',
    { query: z.string().describe('substring to match against title, body, and tags') },
    async ({ query }) => {
      try { return text(tools.memory_search({ query })); } catch (error) { return errorText(error); }
    },
  );

  server.tool(
    'memory_save',
    'Save a memory into the shared BirdEye store so every other harness can recall it.',
    {
      title: z.string(), body: z.string(),
      tags: z.array(z.string()).optional(),
    },
    async ({ title, body, tags }) => {
      try { return text(tools.memory_save({ title, body, tags })); } catch (error) { return errorText(error); }
    },
  );

  server.tool(
    'task_list',
    'List tasks on the shared BirdEye task board.',
    {},
    async () => {
      try { return text(tools.task_list()); } catch (error) { return errorText(error); }
    },
  );

  server.tool(
    'task_claim',
    'Claim a task from the shared board for a harness.',
    { taskId: z.string(), harness: z.string() },
    async ({ taskId, harness }) => {
      try { return text(tools.task_claim({ taskId, harness })); } catch (error) { return errorText(error); }
    },
  );

  server.tool(
    'task_update',
    'Update the status of a shared task (todo | claimed | running | done | failed), optionally appending a note.',
    { taskId: z.string(), status: z.string(), note: z.string().optional() },
    async ({ taskId, status, note }) => {
      try { return text(tools.task_update({ taskId, status, note })); } catch (error) { return errorText(error); }
    },
  );

  server.tool(
    'vault_get',
    'Fetch a secret value from the local encrypted BirdEye vault (local stdio only — store once, use from every harness).',
    { key: z.string() },
    async ({ key }) => {
      try { return text(tools.vault_get({ key })); } catch (error) { return errorText(error); }
    },
  );

  return server;
}

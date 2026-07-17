import { join } from 'node:path';
import type { HarnessKind } from '@birdeye/core';

export interface RegistrationSnippet {
  /** Target config file ('~' allowed) or '' when format is 'text'. */
  file: string;
  format: 'json' | 'toml' | 'text';
  /** For json: a JSON object string to deep-merge. For toml: a block to append. For text: instructions. */
  snippet: string;
  /** JSON path (dot-separated) under which the birdeye server entry lives, for json format. */
  jsonPath?: string;
}

export function mcpBinPath(): string {
  return join(import.meta.dirname, '..', 'bin', 'birdeye-mcp.ts');
}

function jsonEntry(): string {
  return JSON.stringify({ birdeye: { command: 'node', args: [mcpBinPath()] } });
}

/** How to register the BirdEye MCP gateway with each harness. */
export function registrationSnippet(kind: HarnessKind): RegistrationSnippet {
  const bin = mcpBinPath();
  switch (kind) {
    case 'claude-code':
      return { file: '~/.claude.json', format: 'json', jsonPath: 'mcpServers', snippet: jsonEntry() };
    case 'claude-desktop':
      return { file: '~/AppData/Roaming/Claude/claude_desktop_config.json', format: 'json', jsonPath: 'mcpServers', snippet: jsonEntry() };
    case 'cursor':
      return { file: '~/.cursor/mcp.json', format: 'json', jsonPath: 'mcpServers', snippet: jsonEntry() };
    case 'gemini':
      return { file: '~/.gemini/settings.json', format: 'json', jsonPath: 'mcpServers', snippet: jsonEntry() };
    case 'opencode':
      return {
        file: '~/.config/opencode/opencode.json', format: 'json', jsonPath: 'mcp',
        snippet: JSON.stringify({ birdeye: { type: 'local', command: ['node', bin] } }),
      };
    case 'continue':
      return {
        file: '~/.continue/config.json', format: 'json', jsonPath: 'mcpServers',
        snippet: JSON.stringify([{ name: 'birdeye', command: 'node', args: [bin] }]),
      };
    case 'codex':
      return {
        file: '~/.codex/config.toml', format: 'toml',
        snippet: `\n[mcp_servers.birdeye]\ncommand = "node"\nargs = ["${bin.replace(/\\/g, '\\\\')}"]\n`,
      };
    default:
      return {
        file: '', format: 'text',
        snippet: `Add an MCP server named "birdeye" to ${kind} manually:\n  command: node\n  args: ["${bin}"]\nIt exposes memory_search, memory_save, task_list, task_claim, task_update, vault_get.`,
      };
  }
}

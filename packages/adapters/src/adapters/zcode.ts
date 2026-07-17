import { basename, join } from 'node:path';
import { parseMemoryMarkdown, type ScanResult, type SessionRecord, type SkillRecord } from '@birdeye/core';
import type { AdapterContext, HarnessAdapter } from '../adapter.ts';
import { emptyScanResult, makeHarness } from '../adapter.ts';
import { fileBirthtime, fileMtime, listDirs, listFiles, safeReadText } from '../fs-utils.ts';

const KIND = 'zcode' as const;
const MAX_SESSIONS = 500;

function frontmatterField(md: string, field: string): string | null {
  const m = md.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  return m ? (m[1] as string).trim() : null;
}

function scanSkills(configPath: string): SkillRecord[] {
  const skillsDir = join(configPath, 'skills');
  const skills: SkillRecord[] = [];
  for (const name of listDirs(skillsDir)) {
    const skillFile = join(skillsDir, name, 'SKILL.md');
    const text = safeReadText(skillFile);
    if (text !== null) {
      skills.push({ harness: KIND, name, description: frontmatterField(text, 'description') ?? '', path: skillFile });
    } else {
      skills.push({ harness: KIND, name, description: '', path: join(skillsDir, name) });
    }
  }
  for (const file of listFiles(skillsDir, '.md')) {
    skills.push({ harness: KIND, name: basename(file, '.md'), description: '', path: join(skillsDir, file) });
  }
  return skills;
}

/** v2/**: any json/jsonl up to 2 levels, best-effort sessions. */
function scanSessions(configPath: string): SessionRecord[] {
  const sessions: SessionRecord[] = [];
  const root = join(configPath, 'v2');
  const push = (filePath: string): void => {
    if (sessions.length >= MAX_SESSIONS) return;
    sessions.push({
      harness: KIND, id: basename(filePath).replace(/\.[^.]+$/, ''),
      title: `Zcode session ${basename(filePath).replace(/\.[^.]+$/, '')}`,
      startedAt: fileBirthtime(filePath)?.toISOString() ?? null,
      lastActiveAt: fileMtime(filePath)?.toISOString() ?? null,
      messageCount: null, project: null,
    });
  };
  for (const file of listFiles(root)) {
    if (/\.(json|jsonl)$/.test(file)) push(join(root, file));
  }
  for (const sub of listDirs(root)) {
    for (const file of listFiles(join(root, sub))) {
      if (/\.(json|jsonl)$/.test(file)) push(join(root, sub, file));
    }
  }
  return sessions;
}

export const zcodeAdapter: HarnessAdapter = {
  kind: KIND,
  name: 'Zcode',

  candidatePaths(ctx: AdapterContext): string[] {
    return [join(ctx.home, '.zcode')];
  },

  async scan(_ctx: AdapterContext, configPath: string): Promise<ScanResult> {
    const warnings = ['zcode adapter is shallow (undocumented layout)'];

    const memories = [];
    for (const name of ['AGENTS.md', 'CLAUDE.md']) {
      const filePath = join(configPath, name);
      const text = safeReadText(filePath);
      if (text === null) continue;
      const record = parseMemoryMarkdown(text, { harness: KIND, file: filePath, mtime: fileMtime(filePath) });
      if (record) memories.push(record);
    }

    const plugins = listDirs(join(configPath, 'plugin-workspace')).map((name) => ({
      harness: KIND, name, version: null, enabled: true,
    }));

    const harness = makeHarness(KIND, 'Zcode', configPath, warnings, { kind: 'manual' });
    return {
      ...emptyScanResult(harness),
      sessions: scanSessions(configPath),
      skills: scanSkills(configPath),
      plugins,
      memories,
    };
  },
};

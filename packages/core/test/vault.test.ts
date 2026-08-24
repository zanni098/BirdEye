import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Vault } from '../src/vault.ts';

describe('Vault', () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'birdeye-vault-'));
    filePath = join(dir, 'vault.enc');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('set/get round-trips a secret', () => {
    const vault = new Vault({ filePath, passphrase: 'hunter2' });
    vault.set('GITHUB_TOKEN', 'gho_secret123');
    expect(vault.get('GITHUB_TOKEN')).toBe('gho_secret123');
  });

  test('secret value is not stored in plaintext on disk', () => {
    const vault = new Vault({ filePath, passphrase: 'hunter2' });
    vault.set('GITHUB_TOKEN', 'gho_secret123');
    expect(readFileSync(filePath, 'utf8')).not.toContain('gho_secret123');
  });

  test('wrong passphrase throws instead of returning garbage', () => {
    new Vault({ filePath, passphrase: 'right' }).set('KEY', 'value');
    expect(() => new Vault({ filePath, passphrase: 'wrong' }).get('KEY')).toThrow(/wrong passphrase/);
  });

  test('list returns names only, sorted; delete removes', () => {
    const vault = new Vault({ filePath, passphrase: 'p' });
    vault.set('B_KEY', '2');
    vault.set('A_KEY', '1');
    expect(vault.list()).toEqual(['A_KEY', 'B_KEY']);
    expect(vault.delete('A_KEY')).toBe(true);
    expect(vault.delete('A_KEY')).toBe(false);
    expect(vault.list()).toEqual(['B_KEY']);
    expect(vault.get('A_KEY')).toBeNull();
  });
});

test('corrupted vault file throws a vault-prefixed error naming the path', () => {
  writeFileSync(filePath, '{not-json');
  expect(() => new Vault({ filePath, passphrase: 'p' }).list()).toThrow(/vault: failed to parse/);
  expect(() => new Vault({ filePath, passphrase: 'p' }).list()).toThrow(filePath.replace(/\\/g, '\\'));
});

test('structurally invalid vault file throws', () => {
  writeFileSync(filePath, JSON.stringify({ version: 2, salt: 'x', entries: [] }));
  expect(() => new Vault({ filePath, passphrase: 'p' }).list()).toThrow(/vault: invalid structure/);
});

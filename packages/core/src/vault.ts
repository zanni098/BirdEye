import {
  createCipheriv, createDecipheriv, randomBytes, scryptSync,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { hostname, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { defaultBaseDir } from './store.ts';

interface VaultEntry { iv: string; tag: string; data: string; }
interface VaultFile { version: 1; salt: string; entries: Record<string, VaultEntry>; }

const KEY_LENGTH = 32;
const IV_LENGTH = 12;

/** Deterministic per-machine fallback secret when no passphrase is configured. */
function machineSecret(): string {
  return `${hostname()}|${userInfo().username}|birdeye-vault-v1`;
}

export class Vault {
  readonly filePath: string;
  private readonly passphrase: string;

  constructor(opts?: { filePath?: string; passphrase?: string }) {
    this.filePath = opts?.filePath ?? join(defaultBaseDir(), 'vault.enc');
    this.passphrase = opts?.passphrase ?? process.env.BIRDEYE_VAULT_PASSPHRASE ?? machineSecret();
  }

  private load(): VaultFile {
    if (!existsSync(this.filePath)) {
      return { version: 1, salt: randomBytes(16).toString('base64'), entries: {} };
    }
    return JSON.parse(readFileSync(this.filePath, 'utf8')) as VaultFile;
  }

  private save(file: VaultFile): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(file, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, this.filePath);
  }

  private key(salt: string): Buffer {
    return scryptSync(this.passphrase, Buffer.from(salt, 'base64'), KEY_LENGTH);
  }

  set(name: string, value: string): void {
    if (!name.trim()) throw new Error('vault: secret name must not be empty');
    const file = this.load();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key(file.salt), iv);
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    file.entries[name] = {
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    };
    this.save(file);
  }

  get(name: string): string | null {
    const file = this.load();
    const entry = file.entries[name];
    if (!entry) return null;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key(file.salt), Buffer.from(entry.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(entry.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(entry.data, 'base64')), decipher.final()]).toString('utf8');
    } catch {
      throw new Error(`vault: failed to decrypt "${name}" — wrong passphrase or corrupted vault`);
    }
  }

  delete(name: string): boolean {
    const file = this.load();
    if (!(name in file.entries)) return false;
    delete file.entries[name];
    this.save(file);
    return true;
  }

  /** Secret NAMES only — values never leave get(). */
  list(): string[] {
    return Object.keys(this.load().entries).sort();
  }
}

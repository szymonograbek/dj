const { existsSync, readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const ENV_PATH = '.env';

function readEnv() {
  const env = { ...process.env };
  if (!existsSync(ENV_PATH)) return env;
  for (const line of readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = value;
  }
  return env;
}

function memoryDir() {
  return resolve(readEnv().MEMORY_DIR || 'memory');
}

function memoryBackupBundlePath(dir = memoryDir()) {
  const configured = readEnv().MEMORY_BACKUP_BUNDLE;
  return configured ? resolve(configured) : resolve(dirname(dir), 'memory-backup.bundle');
}

function runGit(dir, args) {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `git ${args.join(' ')} failed`;
    throw new Error(detail);
  }
  return result.stdout;
}

function backupMemory(reason = 'Memory backup') {
  const dir = memoryDir();
  if (!existsSync(resolve(dir, '.git'))) return { backedUp: false, reason: `${dir} is not a git repo` };
  runGit(dir, ['add', '.']);
  const diff = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: dir });
  if (diff.status === 0) return { backedUp: false, reason: 'no changes' };
  if (diff.status !== 1) throw new Error('git diff --cached --quiet failed');
  const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  runGit(dir, ['commit', '-m', `${reason} ${stamp}`]);
  const bundle = memoryBackupBundlePath(dir);
  runGit(dir, ['bundle', 'create', bundle, '--all']);
  return { backedUp: true, bundle };
}

module.exports = { readEnv, memoryDir, backupMemory, memoryBackupBundlePath };

#!/usr/bin/env node
const { existsSync, readdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join, relative } = require('node:path');
const { backupMemory, memoryDir } = require('./memory-config');

const ROOT = memoryDir();

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  });
}

function parseValue(raw) {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  }
  return value.replace(/^['"]|['"]$/g, '');
}

function frontmatterBounds(text) {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---\n', 4);
  return end === -1 ? null : { start: 4, end, after: end + 5 };
}

function parseFrontmatter(text) {
  const bounds = frontmatterBounds(text);
  if (bounds === null) return {};
  const frontmatter = text.slice(bounds.start, bounds.end).split(/\r?\n/);
  const data = {};
  for (const line of frontmatter) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) data[match[1]] = parseValue(match[2]);
  }
  return data;
}

function formatValue(value) {
  if (Array.isArray(value)) return `[${value.join(', ')}]`;
  return String(value);
}

function formatFrontmatter(data) {
  return Object.entries(data).map(([key, value]) => `${key}: ${formatValue(value)}`).join('\n');
}

function replaceFrontmatter(text, data) {
  const frontmatter = `---\n${formatFrontmatter(data)}\n---\n`;
  const bounds = frontmatterBounds(text);
  if (bounds === null) return `${frontmatter}\n${text}`;
  return `${frontmatter}${text.slice(bounds.after)}`;
}

function notes() {
  return files(ROOT).map((path) => {
    const text = readFileSync(path, 'utf8');
    return { file: path, path: relative('.', path), frontmatter: parseFrontmatter(text), text };
  });
}

function matches(note, key, expected) {
  const actual = note.frontmatter[key];
  if (actual === undefined) return false;
  if (Array.isArray(actual)) return actual.map(String).some((item) => item.toLowerCase() === expected.toLowerCase());
  return String(actual).toLowerCase() === expected.toLowerCase();
}

function words(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

function fuzzyWordScore(word, needle) {
  if (word === needle) return 100;
  if (word.startsWith(needle)) return 80 - (word.length - needle.length) / 100;
  if (word.includes(needle)) return 60 - (word.length - needle.length) / 100;
  if (needle.length < 4) return 0;
  let last = -1;
  let consecutive = 0;
  for (const char of needle) {
    const found = word.indexOf(char, last + 1);
    if (found === -1) return 0;
    if (found === last + 1) consecutive += 1;
    last = found;
  }
  return consecutive >= Math.max(3, needle.length - 1) ? 20 + consecutive : 0;
}

function fuzzyScore(haystack, needle) {
  const queryWords = words(needle);
  if (queryWords.length === 0) return 0;
  const haystackWords = words(haystack);
  let total = 0;
  for (const queryWord of queryWords) {
    const best = Math.max(0, ...haystackWords.map((word) => fuzzyWordScore(word, queryWord)));
    if (best === 0) return 0;
    total += best;
  }
  return total / queryWords.length;
}

function searchable(note) {
  return [note.path, note.text, ...Object.values(note.frontmatter).flat().map(String)].join(' ');
}

function noteTime(note) {
  const value = note.frontmatter.updated || note.frontmatter.date || note.frontmatter.valid_from || '';
  const time = Date.parse(String(value));
  return Number.isNaN(time) ? 0 : time;
}

function usage() {
  return `Usage:
  ./memory.js list
  ./memory.js latest [type] [limit]
  ./memory.js query <field> <value>
  ./memory.js values <field> [type]
  ./memory.js search <text>
  ./memory.js find <fuzzy-text>
  ./memory.js add-field <field> <default> [type]

Examples:
  ./memory.js latest preference 20
  ./memory.js query type artist
  ./memory.js query stance likes
  ./memory.js values tags
  ./memory.js values status track
  ./memory.js search "Chemical Brothers"
  ./memory.js find chem bros jumpy
  ./memory.js add-field mood unknown
  ./memory.js add-field mood energetic preference`;
}

function compact(note) {
  return {
    path: note.path,
    ...note.frontmatter,
  };
}

function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'list') return console.log(JSON.stringify(notes().map(compact), null, 2));
  if (cmd === 'latest') {
    const type = a;
    const limit = Number.parseInt(b || '20', 10);
    const filtered = type ? notes().filter((note) => note.frontmatter.type === type) : notes();
    return console.log(JSON.stringify(filtered.sort((left, right) => noteTime(right) - noteTime(left)).slice(0, limit).map(compact), null, 2));
  }
  if (cmd === 'query') {
    if (!a || !b) throw new Error(usage());
    return console.log(JSON.stringify(notes().filter((note) => matches(note, a, b)).map(compact), null, 2));
  }
  if (cmd === 'values') {
    if (!a) throw new Error(usage());
    const counts = new Map();
    const filtered = b ? notes().filter((note) => note.frontmatter.type === b) : notes();
    for (const note of filtered) {
      const value = note.frontmatter[a];
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        const key = String(item);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const values = [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([value, count]) => ({ value, count }));
    return console.log(JSON.stringify(values, null, 2));
  }
  if (cmd === 'search') {
    if (!a) throw new Error(usage());
    const needle = a.toLowerCase();
    return console.log(JSON.stringify(notes().filter((note) => note.text.toLowerCase().includes(needle)).map(compact), null, 2));
  }
  if (cmd === 'find') {
    const needle = [a, b, ...process.argv.slice(5)].filter(Boolean).join(' ');
    if (!needle) throw new Error(usage());
    const ranked = notes()
      .map((note) => ({ score: fuzzyScore(searchable(note), needle), note }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((result) => ({ score: Number(result.score.toFixed(3)), ...compact(result.note) }));
    return console.log(JSON.stringify(ranked, null, 2));
  }
  if (cmd === 'add-field') {
    if (!a || b === undefined) throw new Error(usage());
    const type = process.argv[5];
    const changed = [];
    for (const note of notes()) {
      if (type && note.frontmatter.type !== type) continue;
      if (Object.hasOwn(note.frontmatter, a)) continue;
      const next = { ...note.frontmatter, [a]: parseValue(b) };
      writeFileSync(note.file, replaceFrontmatter(note.text, next));
      changed.push(note.path);
    }
    const backup = changed.length === 0 ? { backedUp: false, reason: 'no changes' } : backupMemory('Memory add-field backup');
    return console.log(JSON.stringify({ changed, backup }, null, 2));
  }
  throw new Error(usage());
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
}

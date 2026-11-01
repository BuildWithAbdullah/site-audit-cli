#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Which files in the working tree git would actually track.
 *
 * The verifier counts text files and reads every one of them. Walking the
 * directory instead gives a different answer to the one a reader gets,
 * because a local run leaves `report.html`, `report.json` and `report.md`
 * behind and `.gitignore` names all three. A repository assertion that moves
 * depending on whether somebody ran the tool once is not an assertion.
 *
 * Negation is implemented because it is needed and because it is the part
 * everybody gets wrong: the last pattern that matches a path decides, so an
 * ignore followed by a `!` rule un-ignores, and a `!` rule followed by an
 * ignore re-ignores. CI checks this implementation against `git ls-files`,
 * which is the only way to know it agrees with git rather than with itself.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALWAYS_IGNORED = ['.git'];

export function parseGitignore(text) {
  const rules = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    let pattern = line;
    let negated = false;
    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }
    const dirOnly = pattern.endsWith('/');
    if (dirOnly) pattern = pattern.slice(0, -1);
    const anchored = pattern.includes('/');
    rules.push({ pattern: pattern.replace(/^\//, ''), negated, dirOnly, anchored });
  }
  return rules;
}

function globToRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i += 1;
        if (pattern[i + 1] === '/') i += 1;
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') out += '[^/]';
    else if ('\\^$.|+()[]{}'.includes(c)) out += `\\${c}`;
    else out += c;
  }
  return new RegExp(`^${out}$`);
}

function ruleMatches(rule, relPath) {
  const re = globToRegExp(rule.pattern);
  if (rule.anchored) return re.test(relPath);
  // An unanchored pattern matches at any depth, so it is tested against the
  // path and against every suffix that starts at a path separator.
  const parts = relPath.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    if (re.test(parts.slice(i).join('/'))) return true;
    if (re.test(parts[i])) return true;
  }
  return false;
}

/** Last matching rule wins, exactly as git decides it. */
export function isIgnored(relPath, rules) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly) {
      const dirs = relPath.split('/').slice(0, -1);
      let hit = false;
      for (let i = 1; i <= dirs.length; i += 1) {
        if (ruleMatches(rule, dirs.slice(0, i).join('/'))) hit = true;
      }
      if (!hit) continue;
    } else if (!ruleMatches(rule, relPath)) continue;
    ignored = !rule.negated;
  }
  return ignored;
}

export async function trackedFiles(root = ROOT) {
  const rules = parseGitignore(await readFile(join(root, '.gitignore'), 'utf8'));
  const out = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (ALWAYS_IGNORED.includes(entry.name)) continue;
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(sep).join('/');
      if (entry.isDirectory()) {
        if (isIgnored(`${rel}/x`, rules)) continue;
        await walk(full);
      } else if (!isIgnored(rel, rules)) {
        out.push(rel);
      }
    }
  }
  await walk(root);
  return out.sort();
}

if (process.argv[1] && process.argv[1].endsWith('tracked.mjs')) {
  const files = await trackedFiles();
  process.stdout.write(`${files.join('\n')}\n`);
}

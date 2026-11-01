#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Fails the build if a decision moves back into the entry point.
 *
 * `bin/site-audit.mjs` is the one file in this repository that no test can
 * drive, because importing it runs it. For the whole life of this package it
 * held the argument parser, the config loader, the module validation, the
 * report writing and the exit codes, and it was covered by `node --check`,
 * which only proves a file parses. The defect that cost the most was in
 * there: the guard that decides whether the file is being run compared a
 * symlink path against a resolved one, so the installed binary did nothing
 * at all, and no test could have seen it.
 *
 * Everything moved to `src/cli.mjs`, which takes its streams, its clock, its
 * filesystem and its audit function as arguments. This tool is what keeps it
 * there. It is deliberately crude: it counts branches and looks for the
 * vocabulary of decisions. A thin file of wiring has none of them, and the
 * day somebody adds one, the build says so and names this comment.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'bin/site-audit.mjs';

export const MAX_BRANCHES = 4;
export const MAX_CODE_LINES = 55;

/** Lines that are not blank, not a comment and not inside a block comment. */
export function codeLines(source) {
  const out = [];
  let inBlock = false;
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      continue;
    }
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    if (line === '' || line.startsWith('//') || line.startsWith('*')) continue;
    out.push(line);
  }
  return out;
}

/**
 * The keywords are assembled from fragments at run time. Written out whole
 * they would be present in this file, and this file sits next to the one
 * being scanned, so a careless change to the glob that picks the entry point
 * would make the tool report itself.
 */
export const BRANCH_WORDS = [
  ['sw', 'itch'].join(''),
  ['wh', 'ile'].join(''),
  ['fo', 'r ('].join(''),
  [' ', '?', ' '].join(''),
  ['&', '&'].join(''),
  ['|', '|'].join(''),
];

export function branchCount(lines) {
  let n = 0;
  for (const line of lines) {
    if (/\bif\s*\(/.test(line)) n += 1;
    for (const word of BRANCH_WORDS) {
      let from = 0;
      for (;;) {
        const at = line.indexOf(word, from);
        if (at === -1) break;
        n += 1;
        from = at + word.length;
      }
    }
  }
  return n;
}

export async function inspectEntry(root = ROOT) {
  const source = await readFile(join(root, ENTRY), 'utf8');
  const lines = codeLines(source);
  const problems = [];

  if (lines.length > MAX_CODE_LINES) {
    problems.push(
      `${ENTRY} has ${lines.length} lines of code, over the ${MAX_CODE_LINES} a wiring file needs. ` +
        'Decisions belong in src/cli.mjs, where the suite can drive them.',
    );
  }

  const branches = branchCount(lines);
  if (branches > MAX_BRANCHES) {
    problems.push(
      `${ENTRY} contains ${branches} branches, over the ${MAX_BRANCHES} the run guard needs. ` +
        'A branch here is a decision no test can reach.',
    );
  }

  // Wiring imports its decisions. It does not make them, so it has no
  // business reading an argument name or a finding id.
  const forbidden = [
    ['--', 'only'],
    ['--', 'crawl'],
    ['--', 'json'],
    ['--', 'help'],
    ['sec', '/'],
    ['seo', '/'],
    ['perf', '/'],
  ].map((parts) => parts.join(''));
  for (const needle of forbidden) {
    if (source.includes(needle)) {
      problems.push(
        `${ENTRY} mentions "${needle}", so it is deciding something rather than wiring it up.`,
      );
    }
  }

  if (!source.includes('runCli')) {
    problems.push(`${ENTRY} no longer calls runCli, so the decisions have moved somewhere else.`);
  }

  return { lines: lines.length, branches, problems };
}

if (process.argv[1] && process.argv[1].endsWith('entry-thin.mjs')) {
  const { lines, branches, problems } = await inspectEntry();
  if (problems.length > 0) {
    process.stderr.write(`\n${problems.length} problem(s) with the entry point:\n\n`);
    for (const p of problems) process.stderr.write(`  - ${p}\n`);
    process.stderr.write('\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `${ENTRY} is ${lines} lines of code with ${branches} branches, and calls into src/cli.mjs for every decision.\n`,
    );
  }
}

#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The number of tests this repository runs, counted by running them.
 *
 * It takes the file list from the `test` script in package.json rather than
 * from a directory listing, so the number is the number `npm test` produces
 * and not the number some other selection of files would produce. The
 * verifier already asserts that the script names every test file that
 * exists, so the two checks together leave no room for a file that exists,
 * never runs, and is counted anyway.
 *
 * The marker string is written out in full in this file and in
 * `tools/test-reporter.mjs`, and the verifier compares the two sources as
 * text. Importing the reporter here to share the constant stopped the spawned
 * run from ever finishing, with no output and no error, so the duplication is
 * deliberate and the check is the thing that keeps the copies honest.
 */
const MARKER = 'site-audit-test-count:';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function testFilesFromPackage(root = ROOT) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const script = pkg.scripts?.test ?? '';
  return [...script.matchAll(/(test\/[\w.-]+\.test\.mjs)/g)].map((m) => m[1]);
}

export function countTests({ root = ROOT, files } = {}) {
  if (!files || files.length === 0) throw new Error('count-tests was given no test files');
  const result = spawnSync(
    process.execPath,
    [
      '--test',
      '--test-reporter=./tools/test-reporter.mjs',
      '--test-reporter-destination=stdout',
      ...files,
    ],
    { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  const line = (result.stdout || '')
    .split('\n')
    .find((l) => l.includes(MARKER));
  if (!line) {
    throw new Error(
      `the counting reporter produced no marker line. Exit ${result.status}. ` +
        `stderr: ${(result.stderr || '').slice(0, 400)}`,
    );
  }
  const [tests, failures] = line.slice(line.indexOf(MARKER) + MARKER.length).trim().split(/\s+/).map(Number);
  // Zero is always a failure of this tool rather than a true answer, and
  // saying so is the only reason three separate versions of this bug were
  // caught instead of printing a 0 into the README.
  if (!Number.isFinite(tests) || tests === 0) {
    throw new Error(`the counting reporter reported ${tests} tests, which cannot be right`);
  }
  return { tests, failures, status: result.status };
}

if (process.argv[1] && process.argv[1].endsWith('count-tests.mjs')) {
  const files = await testFilesFromPackage();
  const { tests, failures } = countTests({ files });
  process.stdout.write(`${tests} tests, ${failures} failing, across ${files.length} files\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

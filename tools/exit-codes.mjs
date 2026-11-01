#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAIRS, SIDES, servedIds } from './pairs.mjs';
import { startPairServer } from './pair-server.mjs';
import { DEFAULT_BUDGETS } from '../src/budgets.mjs';
import { moduleFor, severitiesFor } from '../src/catalogue.mjs';
import { countBySeverity } from '../src/util/severity.mjs';

/**
 * Runs the real binary over every example side and checks the exit code.
 *
 * The suite drives the modules and the CLI module. Neither of them runs the
 * file a user actually executes, and the thing that made this tool necessary
 * is that the file a user actually executes did nothing at all for the whole
 * life of the package while every test passed.
 *
 * The expected code is derived, not listed. For each side it takes the id to
 * severity map the pair declares, applies the two served adjustments from
 * `tools/pairs.mjs`, counts the severities per module, and compares them with
 * `DEFAULT_BUDGETS`. A tool that keeps its own table of expected codes agrees
 * with itself; this one can only agree with the manifest, which the test
 * suite asserts against the modules, which the verifier asserts against the
 * catalogue.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(ROOT, 'bin', 'site-audit.mjs');

export function expectedExit(pair, side) {
  const ids = servedIds(pair, pair[side]);
  const findings = Object.entries(ids).map(([id, severity]) => ({
    id,
    severity,
    module: moduleFor(id),
  }));

  for (const { id, severity, module } of findings) {
    if (module === null) throw new Error(`${pair.name}/${side} declares uncatalogued id ${id}`);
    const allowed = severitiesFor(id);
    if (!allowed.includes(severity)) {
      throw new Error(
        `${pair.name}/${side} declares ${id} at ${severity}, which the catalogue does not list`,
      );
    }
  }

  for (const module of pair.modules) {
    const limits = DEFAULT_BUDGETS[module];
    if (!limits) continue;
    const counts = countBySeverity(findings.filter((f) => f.module === module));
    for (const [severity, limit] of Object.entries(limits)) {
      if ((counts[severity] ?? 0) > limit) return 1;
    }
  }
  return 0;
}

/**
 * Asynchronous on purpose. The first version used `spawnSync`, which blocks
 * the event loop of the process that is also serving the page the child
 * fetches, so the child waited the full per-page timeout for a response that
 * could not arrive until it had finished. Every example took 45 seconds and
 * still returned the right code, which is the worst shape a bug can have.
 */
export function runBinary(url, modules, { cwd = ROOT, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [BIN, url, '--only', modules.join(','), '--quiet', '--timeout', '5000'],
      { cwd, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => {
      stdout += c;
    });
    child.stderr.on('data', (c) => {
      stderr += c;
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`the binary did not exit within ${timeoutMs}ms for ${url}`));
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export async function checkAll({ log = () => {} } = {}) {
  const server = await startPairServer();
  const failures = [];
  let checked = 0;
  try {
    for (const pair of PAIRS) {
      for (const side of SIDES) {
        const url = await server.select(pair, side);
        const want = expectedExit(pair, side);
        const got = await runBinary(url, pair.modules);
        checked += 1;
        log(`${pair.name}/${side}: expected ${want}, got ${got.code}`);
        if (got.code !== want) {
          failures.push(
            `${pair.name}/${side}: the budgets and the declared findings imply exit ${want}, ` +
              `the binary returned ${got.code}. stderr: ${got.stderr.slice(0, 300)}`,
          );
        }
      }
    }
  } finally {
    await server.close();
  }
  return { checked, failures };
}

if (process.argv[1] && process.argv[1].endsWith('exit-codes.mjs')) {
  const verbose = process.argv.includes('--verbose');
  const { checked, failures } = await checkAll({ log: verbose ? (m) => process.stdout.write(`${m}\n`) : undefined });
  if (failures.length > 0) {
    process.stderr.write(`\n${failures.length} of ${checked} example runs returned the wrong exit code:\n\n`);
    for (const f of failures) process.stderr.write(`  - ${f}\n`);
    process.stderr.write('\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(`${checked} example sides run through the real binary, every exit code as derived.\n`);
  }
}

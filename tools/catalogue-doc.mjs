#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, OPEN_FAMILIES, MANUAL_IDS } from '../src/catalogue.mjs';
import { MANUAL_REGISTER } from '../src/manual-register.mjs';

/**
 * Renders `docs/04-every-finding.md` from the catalogue.
 *
 * It is generated rather than written because a hand-maintained list of
 * findings is a list that is wrong within a month. `npm run verify` does not
 * check this file; `npm run docs -- --check` does, and CI runs it, so a
 * catalogue change that is not regenerated fails the build.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/04-every-finding.md');

const byModule = (module) => CATALOGUE.filter((e) => e.module === module);
const escape = (s) => s.replace(/\|/g, '\\|');

function table(entries) {
  const rows = entries.map(
    (e) =>
      `| \`${e.id}\` | ${escape(e.means)} |` +
      ` ${e.reachable ? 'yes' : `no, ${escape(e.why)}`} |`,
  );
  return ['| Finding | What it means | Driven in a test |', '|---|---|---|', ...rows].join('\n');
}

const MODULES = [
  ['accessibility', 'Accessibility'],
  ['performance', 'Performance'],
  ['seo', 'Technical SEO'],
  ['security', 'Security'],
];

const body = `# Every finding this tool can emit

Generated from \`src/catalogue.mjs\` by \`npm run docs\`. Do not edit by hand.

${CATALOGUE.length} catalogued findings, ${OPEN_FAMILIES.length} open families and
${MANUAL_IDS.length} manual checks.

The right-hand column is the part worth reading. "Driven in a test" means
\`test/catalogue.test.mjs\` produces that exact finding from a real call into a
real check module, and CI fails if it stops doing so. A check nobody has
watched fire is indistinguishable from a check that does not work, so the
repository refuses to ship one quietly.

${MODULES.map(([key, label]) => `## ${label}\n\n${table(byModule(key))}`).join('\n\n')}

## Open families

Three identifiers carry a value that comes from the page rather than from this
repository, so they are patterns rather than fixed ids.

| Pattern | What it means | Example |
|---|---|---|
${OPEN_FAMILIES.map((f) => `| \`${f.prefix}*\` | ${escape(f.means)} | \`${f.example}\` |`).join('\n')}

## Manual checks

These are not defects found by the tool. They are the checks it cannot make,
emitted as \`info\` so they appear in the report rather than being left to
memory. They never count against a budget: failing a build for something no
machine can verify trains people to delete the check.

| Check | Criterion |
|---|---|
${MANUAL_REGISTER.map((e) => `| \`${e.id}\` | ${escape(e.title ?? e.criterion ?? e.id)} |`).join('\n')}
`;

const check = process.argv.includes('--check');
if (check) {
  const { readFile } = await import('node:fs/promises');
  let current = '';
  try {
    current = await readFile(OUT, 'utf8');
  } catch {
    /* missing counts as out of date */
  }
  if (current !== body) {
    process.stderr.write(
      'docs/04-every-finding.md is out of date. Run `npm run docs` and commit the result.\n',
    );
    process.exit(1);
  }
  process.stdout.write('docs/04-every-finding.md is up to date.\n');
} else {
  await writeFile(OUT, body, 'utf8');
  process.stdout.write(`Wrote ${OUT}\n`);
}

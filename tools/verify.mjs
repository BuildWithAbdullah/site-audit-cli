#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE, OPEN_FAMILIES, MANUAL_IDS, isCatalogued } from '../src/catalogue.mjs';
import { ALL_MODULES } from '../src/audit.mjs';
import { SEVERITIES } from '../src/util/severity.mjs';

/**
 * Assertions about the repository itself, rather than about a website.
 *
 * The test suite proves the code does what it says. This proves the
 * repository is internally consistent: that the catalogue and the source
 * agree in both directions, that no test file can be added and silently never
 * run, that the Node version this package claims to support is a version its
 * own dependency tree will install on, and that the README describes the tool
 * that is actually here.
 *
 * Run it with `npm run verify`. It exits non-zero on the first failing
 * category and prints every failure, not just the first.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
let assertions = 0;

function check(condition, message) {
  assertions += 1;
  if (!condition) failures.push(message);
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'coverage']);
const TEXT = new Set(['.mjs', '.js', '.json', '.md', '.yml', '.yaml', '.html', '.txt', '']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

const files = await walk(ROOT);
const textFiles = files.filter((f) => TEXT.has(extname(f)));
const read = async (f) => readFile(f, 'utf8');
const rel = (f) => relative(ROOT, f);

const pkg = JSON.parse(await read(join(ROOT, 'package.json')));
const readme = await read(join(ROOT, 'README.md'));
// The catalogue is excluded on purpose. It names every id, so scanning it
// for emitted ids would have the catalogue prove itself and would report a
// constructed id as a literal, which is exactly what it did the first time
// this verifier was run.
const sourceFiles = files.filter(
  (f) => rel(f).startsWith('src/') && f.endsWith('.mjs') && rel(f) !== 'src/catalogue.mjs',
);
const sources = Object.fromEntries(
  await Promise.all(sourceFiles.map(async (f) => [rel(f), await read(f)])),
);
const allSource = Object.values(sources).join('\n');

// ---------------------------------------------------------------- catalogue

/**
 * Ids built at runtime from a value the page supplies cannot appear as string
 * literals, so they are exempt from the literal check and required to be
 * absent from it instead. Getting this backwards would let a typo in a
 * template go unnoticed, which is the whole reason the exemption is a list
 * and not a wildcard.
 */
const CONSTRUCTED = new Set([
  'sec/csp-unsafeinline',
  'sec/csp-unsafeeval',
  'run/accessibility-did-not-run',
  'run/performance-did-not-run',
]);

const literalIds = new Set(
  [...allSource.matchAll(/id: *'([a-z0-9]+\/[a-z0-9.-]+)'/g)].map((m) => m[1]),
);

for (const id of literalIds) {
  check(isCatalogued(id), `src emits "${id}" but the catalogue does not list it`);
}

for (const entry of CATALOGUE) {
  if (CONSTRUCTED.has(entry.id)) {
    check(
      !literalIds.has(entry.id),
      `"${entry.id}" is listed as constructed but appears as a literal in src`,
    );
  } else {
    check(
      literalIds.has(entry.id),
      `the catalogue lists "${entry.id}" but no src file emits it`,
    );
  }
  check(
    ALL_MODULES.includes(entry.module),
    `"${entry.id}" claims module "${entry.module}", which is not one of ${ALL_MODULES.join(', ')}`,
  );
  check(!/\s$/.test(entry.means), `"${entry.id}" has trailing whitespace in its description`);
}

for (const family of OPEN_FAMILIES) {
  check(
    allSource.includes(family.prefix.replace(/\/$/, '')) || allSource.includes(family.prefix),
    `the catalogue lists the open family "${family.prefix}" but src never builds it`,
  );
}

check(MANUAL_IDS.length > 0, 'the manual register is empty');
for (const id of MANUAL_IDS) {
  check(isCatalogued(id), `manual register entry "${id}" is not catalogued`);
}

// ------------------------------------------------------------------- tests

const testDir = join(ROOT, 'test');
const testFiles = (await readdir(testDir)).filter((f) => f.endsWith('.test.mjs')).sort();
const testScript = pkg.scripts?.test ?? '';

check(testFiles.length > 0, 'there are no test files');
check(
  !/[*?]/.test(testScript),
  'the test script uses a glob. `node --test` did not accept glob patterns before Node 21, ' +
    'so a globbed script runs nothing on an older Node while appearing to pass. Name the files.',
);
for (const file of testFiles) {
  check(
    testScript.includes(`test/${file}`),
    `test/${file} exists but the test script does not name it, so it never runs`,
  );
}
const named = [...testScript.matchAll(/test\/([\w.-]+\.test\.mjs)/g)].map((m) => m[1]);
for (const file of named) {
  check(testFiles.includes(file), `the test script names test/${file}, which does not exist`);
}

// ----------------------------------------------------------------- engines

/** Lowest version a range like ">=22.12.0" or "^20.1" admits. */
function minimumOf(range) {
  const m = String(range).match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const show = (v) => v.join('.');

const declared = minimumOf(pkg.engines?.node ?? '');
check(declared !== null, 'package.json declares no engines.node range');

const depNames = Object.keys(pkg.dependencies ?? {});
let strictest = declared;
let strictestBy = 'this package';
for (const name of depNames) {
  let depPkg;
  try {
    depPkg = JSON.parse(await read(join(ROOT, 'node_modules', name, 'package.json')));
  } catch {
    continue; // Dependencies are not installed. CI installs before verifying.
  }
  const depMin = minimumOf(depPkg.engines?.node ?? '');
  if (!depMin) continue;
  if (cmp(depMin, strictest) > 0) {
    strictest = depMin;
    strictestBy = `${name}@${depPkg.version}`;
  }
}
if (declared) {
  check(
    cmp(declared, strictest) >= 0,
    `package.json says Node ${pkg.engines.node}, but ${strictestBy} requires at least ` +
      `${show(strictest)}. A visitor on the version this package advertises cannot install it.`,
  );
}

// ---------------------------------------------------------------------- CI

const workflow = await read(join(ROOT, '.github/workflows/verify.yml'));
const ciVersions = [...workflow.matchAll(/'(\d+)(?:\.\d+)*'/g)].map((m) => Number(m[1]));
const unique = [...new Set(ciVersions)].sort((a, b) => a - b);
check(unique.length >= 2, 'CI runs one Node version only, so a version-specific break is invisible');
if (declared) {
  check(
    unique.includes(declared[0]),
    `CI does not run Node ${declared[0]}, which is the oldest version package.json claims to support`,
  );
}
check(workflow.includes('npm run verify'), 'CI does not run the repository verifier');
check(workflow.includes('npm test'), 'CI does not run the test suite');

// ------------------------------------------------------------------ README

check(readme.includes('## Verifying'), 'the README has no Verifying section');
for (const script of ['npm test', 'npm run verify']) {
  check(readme.includes(script), `the README never shows \`${script}\``);
}
for (const module of ALL_MODULES) {
  check(readme.includes(module), `the README does not mention the ${module} module`);
}
const claimed = Number((readme.match(/(\d+)\s+catalogued\s+findings/) || [])[1]);
check(
  claimed === CATALOGUE.length,
  `the README claims ${claimed} catalogued findings; the catalogue holds ${CATALOGUE.length}`,
);
const claimedTests = Number((readme.match(/(\d+)\s+tests/) || [])[1]);
check(Number.isFinite(claimedTests), 'the README does not state a test count');

// ------------------------------------------------------------------- prose

/**
 * The needles are assembled at runtime. Written out as literals they would be
 * present in this file, and this file is one of the files being scanned.
 */
const DASHES = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)];
const DASH_NAMES = ['em dash', 'en dash'];

for (const file of textFiles) {
  const text = await read(file);
  DASHES.forEach((dash, i) => {
    check(!text.includes(dash), `${rel(file)} contains a ${DASH_NAMES[i]}`);
  });
}

// --------------------------------------------------------------- severities

for (const severity of SEVERITIES) {
  check(typeof severity === 'string' && severity.length > 0, 'a severity is not a string');
}
check(SEVERITIES.includes('info'), 'the severity vocabulary lost its non-defect level');

// ------------------------------------------------------------------ licence

const licence = await read(join(ROOT, 'LICENSE'));
check(/MIT License/i.test(licence), 'LICENSE is not the MIT licence');
check(pkg.license === 'MIT', 'package.json does not declare the MIT licence');

// ------------------------------------------------------------------- report

if (failures.length > 0) {
  process.stderr.write(`\n${failures.length} of ${assertions} repository assertions failed:\n\n`);
  for (const message of failures) process.stderr.write(`  - ${message}\n`);
  process.stderr.write('\n');
  process.exit(1);
}

process.stdout.write(
  `${assertions} repository assertions passed ` +
    `(${CATALOGUE.length} catalogued findings, ${OPEN_FAMILIES.length} open families, ` +
    `${MANUAL_IDS.length} manual checks, ${testFiles.length} test files).\n`,
);

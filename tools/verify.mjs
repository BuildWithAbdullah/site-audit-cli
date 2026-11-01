#!/usr/bin/env node
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CATALOGUE,
  OPEN_FAMILIES,
  MANUAL_IDS,
  isCatalogued,
  severitiesFor,
  moduleFor,
} from '../src/catalogue.mjs';
import { ALL_MODULES } from '../src/audit.mjs';
import { SEVERITIES } from '../src/util/severity.mjs';
import { LIMITS } from '../src/limits.mjs';
import {
  PAIRS,
  SIDES,
  SERVED_ADDS,
  SERVED_DROPS,
  allPairIds,
  relativePathFor,
} from './pairs.mjs';
import { trackedFiles } from './tracked.mjs';
import { testFilesFromPackage, countTests } from './count-tests.mjs';
import { inspectEntry } from './entry-thin.mjs';

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

/**
 * A number the README states about itself, matched as a whole line.
 *
 * Matching with a pattern against the whole file is not a check. A number
 * that wraps across two lines is not matched at all and silently passes, and
 * a number that appears twice is matched once and the second copy is never
 * compared. This splits the README into lines, matches each one, and fails
 * unless exactly one line matches, so both of those fail.
 *
 * It makes two assertions and makes both of them unconditionally. An earlier
 * version returned early when the line count was wrong, so it made one
 * assertion in that case and two otherwise, which meant correcting a number
 * in the README moved the total number of assertions, and the total is
 * itself a number the README states. That never converges.
 */
function statedOnOneLine(label, pattern, expected) {
  const lines = readme.split('\n');
  const matching = lines.filter((line) => pattern.test(line));
  check(
    matching.length === 1,
    `the README should state ${label} on exactly one line and ${matching.length} lines match. ` +
      'A wrapped number is never checked and a duplicated one is checked once.',
  );
  const found = matching.length === 1 ? Number(matching[0].match(pattern)[1]) : null;
  check(
    found === expected,
    `the README says ${found} for ${label}; the repository holds ${expected}`,
  );
  return found;
}

const TEXT = new Set(['.mjs', '.js', '.json', '.md', '.yml', '.yaml', '.html', '.txt', '']);

/**
 * The file list comes from `tools/tracked.mjs`, which reads `.gitignore`,
 * rather than from a directory walk.
 *
 * It used to walk the tree, which meant the number of prose assertions this
 * verifier makes went up by three for anybody who had run the tool once in
 * the working directory, because `.gitignore` names `report.html`,
 * `report.json` and `report.md`. An assertion count that moves depending on
 * whether somebody ran the tool is not a count of anything. CI checks the
 * matcher against `git ls-files`, which is the only way to know it agrees
 * with git and not merely with itself.
 */
const files = (await trackedFiles(ROOT)).map((f) => join(ROOT, f));
const textFiles = files.filter((f) => TEXT.has(extname(f)));
const read = async (f) => readFile(f, 'utf8');
const rel = (f) => relative(ROOT, f);

const pkg = JSON.parse(await read(join(ROOT, 'package.json')));
const readme = await read(join(ROOT, 'README.md'));
const limitsTest = await read(join(ROOT, 'test/limits.test.mjs'));
// The catalogue is excluded on purpose. It names every id, so scanning it
// for emitted ids would have the catalogue prove itself and would report a
// constructed id as a literal, which is exactly what it did the first time
// this verifier was run.
/**
 * Two files are excluded by name. The catalogue names every id, so scanning
 * it would have the catalogue prove itself and would report a constructed id
 * as a literal, which is exactly what it did the first time this ran.
 * `src/limits.mjs` names six `limit/` ids that are not findings at all, and
 * including it made the verifier demand catalogue entries for them.
 */
const SCAN_EXCLUDED = ['src/catalogue.mjs', 'src/limits.mjs'];
const sourceFiles = files.filter(
  (f) => rel(f).startsWith('src/') && f.endsWith('.mjs') && !SCAN_EXCLUDED.includes(rel(f)),
);
for (const excluded of SCAN_EXCLUDED) {
  check(
    files.some((f) => rel(f) === excluded),
    `the literal scan excludes ${excluded}, which does not exist, so the exclusion is stale`,
  );
}
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

/**
 * The severity table, checked for shape here and checked against the code by
 * `test/catalogue.test.mjs`, which drives every branch and asserts the
 * observed severities equal the declared ones in both directions.
 */
for (const entry of CATALOGUE) {
  check(
    Array.isArray(entry.severities) && entry.severities.length > 0,
    `"${entry.id}" declares no severities`,
  );
  check(
    (entry.severities ?? []).every((sev) => SEVERITIES.includes(sev)),
    `"${entry.id}" declares a severity that is not in the vocabulary`,
  );
  check(
    new Set(entry.severities ?? []).size === (entry.severities ?? []).length,
    `"${entry.id}" lists the same severity twice`,
  );
  check(
    severitiesFor(entry.id) === entry.severities,
    `severitiesFor does not resolve "${entry.id}" to its own entry`,
  );
  check(moduleFor(entry.id) === entry.module, `moduleFor disagrees with the entry for "${entry.id}"`);
}
// Ten entries carry two severities because they choose from the value they
// found. If that number ever reaches zero, the two-way assertion in the test
// suite has nothing left to force and the field has become decoration.
const branching = CATALOGUE.filter((e) => (e.severities ?? []).length > 1);
check(branching.length >= 8, `only ${branching.length} findings choose their severity`);

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
/**
 * The floor has to be an exact version in CI, not a bare major.
 * `actions/setup-node` resolves `'22'` to the newest release of the 22 line,
 * so a job named after a major tests whatever shipped most recently and not
 * the version package.json promises. The engines job pins the full triple.
 */
if (declared) {
  const exact = show(declared);
  check(
    workflow.includes(`'${exact}'`),
    `package.json promises Node ${exact} and no CI job pins that exact version. ` +
      'A job named after the major line tests the newest release of it instead.',
  );
  const bareMajors = [...workflow.matchAll(/node-version: '(\d+)'/g)].map((m) => m[1]);
  check(
    !bareMajors.includes(String(declared[0])),
    `CI names Node '${declared[0]}' as a bare major, which resolves to the newest release of that line`,
  );
}
check(workflow.includes('npm run verify'), 'CI does not run the repository verifier');
check(workflow.includes('npm test'), 'CI does not run the test suite');
for (const script of ['npm run exit-codes', 'npm run entry-thin']) {
  check(workflow.includes(script), `CI does not run \`${script}\``);
}
// Deliberately the node invocation and not `npm run`: this step redirects,
// and npm writes a banner to stdout that the redirect would capture.
check(
  workflow.includes('node tools/tracked.mjs'),
  'CI does not run the gitignore matcher',
);
check(
  workflow.includes('git ls-files'),
  'CI does not check the gitignore matcher against git, so it only agrees with itself',
);

// ------------------------------------------------------------------ README

check(readme.includes('## Verifying'), 'the README has no Verifying section');
for (const script of ['npm test', 'npm run verify']) {
  check(readme.includes(script), `the README never shows \`${script}\``);
}
for (const module of ALL_MODULES) {
  check(readme.includes(module), `the README does not mention the ${module} module`);
}
statedOnOneLine('catalogued findings', /(\d+) catalogued findings/, CATALOGUE.length);
statedOnOneLine('open families', /(\d+) open families/, OPEN_FAMILIES.length);
statedOnOneLine('manual checks', /(\d+) manual checks/, MANUAL_IDS.length);
statedOnOneLine('declared limits', /(\d+) declared limits/, LIMITS.length);
statedOnOneLine('example pairs', /(\d+) example pairs/, PAIRS.length);
statedOnOneLine('findings the pairs reach', /the pairs reach (\d+) of them/, allPairIds().length);

/**
 * The test count is produced by running the tests.
 *
 * It used to be read out of the README and checked only for being a number,
 * which is not a check at all: any number passed. The count now comes from
 * `tools/count-tests.mjs`, which runs the files the `test` script names
 * through a counting reporter, because every other way of getting this
 * number has been wrong on some Node version in the support range.
 */
const testFileNames = await testFilesFromPackage(ROOT);
check(
  testFileNames.length === testFiles.length,
  `the test script names ${testFileNames.length} files and ${testFiles.length} exist`,
);
if (process.env.SKIP_TEST_COUNT === '1') {
  // The CI job that counts tests runs this verifier too, and running the
  // whole suite twice inside one job doubles the slowest step for nothing.
  check(true, 'the test count was skipped by request');
  check(true, 'the test count was skipped by request');
} else {
  const counted = countTests({ root: ROOT, files: testFileNames });
  statedOnOneLine('tests', /(\d+) tests/, counted.tests);
}

// ------------------------------------------------------------------- prose

/**
 * The needles are assembled at runtime. Written out as literals they would be
 * present in this file, and this file is one of the files being scanned.
 */
const DASHES = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)];
const DASH_NAMES = ['em dash', 'en dash'];

/**
 * Two assertions, not two per file.
 *
 * It used to make one per dash per file, which meant the number of
 * assertions this verifier reports was partly a count of how many files the
 * repository has, and adding an unrelated document moved a number in the
 * README. A count that moves when something it is not about changes is not a
 * self check. The offenders are collected and named in one message instead,
 * so the report is no worse and the total is about what it says it is about.
 */
const dashOffenders = DASHES.map(() => []);
for (const file of textFiles) {
  const text = await read(file);
  DASHES.forEach((dash, i) => {
    if (text.includes(dash)) dashOffenders[i].push(rel(file));
  });
}
DASHES.forEach((_, i) => {
  check(
    dashOffenders[i].length === 0,
    `${DASH_NAMES[i]} found in ${dashOffenders[i].join(', ')}`,
  );
});
check(textFiles.length > 20, `only ${textFiles.length} text files were scanned for prose`);

// --------------------------------------------------------------- severities

for (const severity of SEVERITIES) {
  check(typeof severity === 'string' && severity.length > 0, 'a severity is not a string');
}
check(SEVERITIES.includes('info'), 'the severity vocabulary lost its non-defect level');

// ------------------------------------------------------------------ licence

const licence = await read(join(ROOT, 'LICENSE'));
check(/MIT License/i.test(licence), 'LICENSE is not the MIT licence');
check(pkg.license === 'MIT', 'package.json does not declare the MIT licence');

// ------------------------------------------------------------------- pairs

/**
 * The examples. The test suite asserts each side against the real modules;
 * this asserts the manifest is well formed and that the relationship between
 * the declared set and the served set is code rather than a per-pair excuse.
 */
const exampleFiles = (await readdir(join(ROOT, 'examples'))).sort();
const expectedFiles = PAIRS.flatMap((p) => SIDES.map((s) => `${p.name}.${s}.html`)).sort();
check(
  exampleFiles.join(',') === expectedFiles.join(','),
  'the examples directory and the pairs manifest do not hold the same set of sides',
);
check(PAIRS.length >= 10, `only ${PAIRS.length} example pairs`);

for (const pair of PAIRS) {
  check(pair.demonstrates.length > 60, `${pair.name} does not say what it demonstrates`);
  check(pair.title.length > 20, `${pair.name} has no title worth reading`);
  check(pair.modules.every((m) => ALL_MODULES.includes(m)), `${pair.name} names an unknown module`);
  for (const side of SIDES) {
    for (const [id, severity] of Object.entries(pair[side].ids)) {
      check(isCatalogued(id), `${pair.name}/${side} declares uncatalogued id "${id}"`);
      check(
        (severitiesFor(id) ?? []).includes(severity),
        `${pair.name}/${side} declares "${id}" at ${severity}, which the catalogue does not allow`,
      );
      check(
        pair.modules.includes(moduleFor(id)),
        `${pair.name}/${side} declares "${id}" from a module it does not run`,
      );
    }
    check(
      files.some((f) => rel(f) === relativePathFor(pair, side)),
      `${relativePathFor(pair, side)} is missing or is not tracked`,
    );
    const response = pair[side].response;
    check(
      response !== undefined && Number.isInteger(response.status),
      `${pair.name}/${side} declares no response status`,
    );
    check(
      response !== undefined && typeof response.headers === 'object',
      `${pair.name}/${side} declares no response headers`,
    );
  }
  check(
    Object.keys(pair.before.ids).length > 0,
    `${pair.name} has a broken side that reports nothing, which is not a pair`,
  );
}

// Every served adjustment has to be about a real check, and there has to be
// at least one of each kind, or `servedIds` is doing nothing.
for (const id of Object.keys(SERVED_ADDS)) {
  check(isCatalogued(id), `the served additions name uncatalogued id "${id}"`);
}
for (const id of SERVED_DROPS) {
  check(isCatalogued(id), `the served drops name uncatalogued id "${id}"`);
}
check(Object.keys(SERVED_ADDS).length > 0 && SERVED_DROPS.length > 0, 'the served adjustments are empty');
check(
  allPairIds().length < CATALOGUE.length,
  'the pairs claim to reach the whole catalogue, which fifteen pages cannot do',
);
check(
  PAIRS.filter((p) => p.partial).length === 1,
  'exactly one pair is a deliberate partial correction, and it has to say so',
);

// ------------------------------------------------------------------ limits

for (const limit of LIMITS) {
  check(limit.id.startsWith('limit/'), `${limit.id} is not named as a limit`);
  check(limit.claim.length > 80, `${limit.id} needs a claim somebody could disagree with`);
  check(limit.notEvidenceAbout.length > 10, `${limit.id} must name what it is not evidence about`);
  check(limit.assertedBy.length > 20, `${limit.id} must name the test that argues it`);
  check(
    limitsTest.includes(limit.assertedBy),
    `${limit.id} says it is asserted by "${limit.assertedBy}" and test/limits.test.mjs has no such test`,
  );
  check(
    limitsTest.includes(limit.id),
    `${limit.id} is never named in test/limits.test.mjs`,
  );
}
check(LIMITS.length >= 5, `only ${LIMITS.length} declared limits`);
check(
  new Set(LIMITS.map((l) => l.assertedBy)).size === LIMITS.length,
  'two limits claim the same test, so one of them is not argued',
);

/**
 * Nothing shipped may import from the test directory.
 *
 * `package.json` ships `bin`, `src`, `tools` and `examples`, and not `test`.
 * The pair harness started life under `test/fixtures/`, which meant
 * `tools/exit-codes.mjs` imported a file that an installed copy of this
 * package would not have. The import worked here and would have failed
 * anywhere else, which is the quietest kind of broken.
 */
const shipped = (pkg.files ?? []).filter((f) => !f.includes('.'));
check(shipped.length >= 3, 'package.json ships fewer directories than this repository has');
const shippedImporters = files.filter(
  (f) => f.endsWith('.mjs') && shipped.some((dir) => rel(f).startsWith(`${dir}/`)),
);
check(shippedImporters.length > 10, `only ${shippedImporters.length} shipped modules were scanned`);
const testImports = [];
for (const file of shippedImporters) {
  const text = await read(file);
  if (/from '[^']*\btest\//.test(text)) testImports.push(rel(file));
}
check(
  testImports.length === 0,
  `${testImports.join(', ')} import from test/, which package.json does not ship`,
);

// ------------------------------------------------------------- entry point

const entry = await inspectEntry(ROOT);
check(
  entry.problems.length === 0,
  `the entry point is no longer thin: ${entry.problems.join(' | ')}`,
);
check(
  entry.lines > 10,
  'the entry point has shrunk to nothing, so it is probably no longer wiring anything up',
);

/**
 * The counting reporter and the counter hold the same marker string as two
 * literals, because importing one into the other stopped the spawned test
 * run from ever finishing, with no output and no error. The copies are kept
 * honest by comparing the two sources as text, which is a stricter check
 * than sharing a constant would have been.
 */
const reporterSource = await read(join(ROOT, 'tools/test-reporter.mjs'));
const counterSource = await read(join(ROOT, 'tools/count-tests.mjs'));
const markerOf = (source) => (source.match(/'(site-audit-test-count:)'/) || [])[1] ?? null;
check(markerOf(reporterSource) !== null, 'the counting reporter has no marker string');
check(
  markerOf(reporterSource) === markerOf(counterSource),
  'the counting reporter and the counter disagree about the marker string',
);

// --------------------------------------------------------------- generated

/**
 * `npm run` writes a banner to stdout, so a CI step that redirects an
 * `npm run` captures the banner along with the output and the comparison it
 * was supposed to make becomes a comparison of banners.
 */
for (const line of workflow.split('\n')) {
  if (!line.includes('>')) continue;
  check(
    !/npm run/.test(line),
    `the CI step "${line.trim()}" redirects an npm run, which captures npm's banner as well`,
  );
}

// -------------------------------------------------- the assertion count

/**
 * The README states how many assertions this file makes, and this is the
 * pair of checks that holds it to it. Both run unconditionally, and both are
 * counted, so the total does not move depending on whether they pass.
 *
 * The arithmetic converges because the condition below is evaluated before
 * `check` increments, and the `+ 1` accounts for the increment this very
 * check is about to make. Nothing after this point adds an assertion.
 *
 * The count must also not depend on anything the number is not about. An
 * earlier verifier in this family made one assertion per line of the CI
 * workflow, so its README total was partly a measure of how long the CI file
 * was, and lengthening a comment in a YAML file moved a number in a README.
 */
const ASSERTION_PATTERN = /(\d+) repository assertions/;
const assertionLines = readme.split('\n').filter((line) => ASSERTION_PATTERN.test(line));
check(
  assertionLines.length === 1,
  `the README should state its assertion count on exactly one line and ${assertionLines.length} lines match`,
);
const claimedAssertions =
  assertionLines.length === 1 ? Number(assertionLines[0].match(ASSERTION_PATTERN)[1]) : null;
check(
  claimedAssertions === assertions + 1,
  `the README says ${claimedAssertions} repository assertions; this run makes ${assertions + 1}`,
);

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

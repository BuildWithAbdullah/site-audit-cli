/**
 * A test reporter whose only job is to count tests.
 *
 * Three ways of getting this number have been wrong here. Parsing the
 * reporter output breaks because the same suite prints `# tests 50` on one
 * Node line and `info tests 50` on another. Using `run()` from `node:test`
 * breaks because it forwards one `test:pass` per file on some versions and
 * one per test on others. Selecting `details.type === 'test'` breaks because
 * the field is undefined on several versions, which silently counts zero.
 *
 * In a reporter every per-test event is present on every version in the
 * support range, and the only thing that varies is whether a suite is
 * labelled, so the selection is `type !== 'suite'`. The count is written as
 * one line with a marker, because a reporter shares stdout with whatever
 * else the run prints.
 */
export const MARKER = 'site-audit-test-count:';

export default async function* countingReporter(source) {
  let tests = 0;
  let failures = 0;
  for await (const event of source) {
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      if (event.data?.details?.type === 'suite') continue;
      tests += 1;
      if (event.type === 'test:fail') failures += 1;
    }
  }
  yield `${MARKER} ${tests} ${failures}\n`;
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { PAIRS, SIDES, servedIds, readSide, SERVED_ADDS, SERVED_DROPS, allPairIds } from '../tools/pairs.mjs';
import { responseFor, findingsFor, asMap, PAIR_ORIGIN } from '../src/pair-runner.mjs';
import { startPairServer, PAGE_PATH } from '../tools/pair-server.mjs';
import { fetchWithMeta } from '../src/util/fetch.mjs';
import { severitiesFor, moduleFor, REACHABLE_IDS, isCatalogued } from '../src/catalogue.mjs';

/**
 * Every example, both sides, asserted as an exact set in both directions.
 *
 * A corrected example on its own proves nothing, because nobody can tell
 * whether the tool would have said anything about the version that was
 * wrong. Each pair declares the findings its `before` side produces and the
 * residual its `after` side still produces, as id to severity, and both are
 * compared with `deepEqual` so an extra finding fails exactly as loudly as a
 * missing one. Declaring the severity rather than only the id is what makes
 * `server-error` possible: correcting a 500 to a 404 removes no finding at
 * all and changes one severity, which a bare id list cannot express.
 */

const produced = new Set();

for (const pair of PAIRS) {
  for (const side of SIDES) {
    test(`${pair.name}/${side} produces exactly its declared findings`, async () => {
      const loaded = await readSide(pair, side);
      const findings = await findingsFor(responseFor(PAGE_PATH, loaded), pair.modules);
      for (const f of findings) produced.add(f.id);
      assert.deepEqual(asMap(findings), pair[side].ids);
    });
  }
}

test('every declared severity is one the catalogue allows for that id', () => {
  for (const pair of PAIRS) {
    for (const side of SIDES) {
      for (const [id, severity] of Object.entries(pair[side].ids)) {
        const allowed = severitiesFor(id);
        assert.ok(allowed, `${id} in ${pair.name}/${side} is not catalogued`);
        assert.ok(
          allowed.includes(severity),
          `${pair.name}/${side} declares ${id} at ${severity}, catalogue allows ${allowed.join(', ')}`,
        );
      }
    }
  }
});

test('every declared finding belongs to a module the pair actually runs', () => {
  for (const pair of PAIRS) {
    for (const side of SIDES) {
      for (const id of Object.keys(pair[side].ids)) {
        assert.ok(
          pair.modules.includes(moduleFor(id)),
          `${pair.name} declares ${id} but does not run the ${moduleFor(id)} module`,
        );
      }
    }
  }
});

test('a corrected side never carries a finding the broken side did not have', () => {
  // The exception is a severity change, which is why `server-error` is
  // allowed: its id is on both sides. A brand new id on the corrected side
  // would mean the correction introduced a defect, which has happened in
  // another repository on this account and is worth a standing assertion.
  for (const pair of PAIRS) {
    const before = new Set(Object.keys(pair.before.ids));
    const newIds = Object.keys(pair.after.ids).filter((id) => !before.has(id));
    if (pair.partial) {
      assert.ok(
        pair.partial.length > 60,
        `${pair.name} claims a partial correction and has to say what it trades for what`,
      );
      assert.ok(
        newIds.length > 0,
        `${pair.name} declares itself a partial correction but introduces nothing, so the note is wrong`,
      );
      continue;
    }
    assert.deepEqual(
      newIds,
      [],
      `${pair.name}/after reports ${newIds.join(', ')}, which before did not. Either the correction made something worse, or the pair needs a partial note saying what it trades.`,
    );
  }
  assert.equal(
    PAIRS.filter((p) => p.partial).length,
    1,
    'exactly one pair is a deliberate partial correction',
  );
});

test('at least one pair has a residual, and at least one clears completely', () => {
  const withResidual = PAIRS.filter((p) => Object.keys(p.after.ids).length > 0);
  const cleared = PAIRS.filter((p) => Object.keys(p.after.ids).length === 0);
  assert.ok(withResidual.length > 0, 'a set of pairs that all clear to nothing is a set of claims');
  assert.ok(cleared.length > 0);
});

/**
 * The same pairs again, through the real fetch layer over real HTTP.
 *
 * The block above drives the check modules with a response object this
 * repository built. This one serves the file, fetches it with the code the
 * binary uses, and compares against `servedIds`, which derives the served
 * set from the declared set by applying two adjustments as code. Neither the
 * pair nor this test may add an entry to cover a difference: if the served
 * result disagrees, either the page or the adjustment is wrong.
 */
test('every pair side produces its derived served set through real HTTP', async (t) => {
  const server = await startPairServer();
  t.after(() => server.close());

  for (const pair of PAIRS) {
    for (const side of SIDES) {
      const url = await server.select(pair, side);
      const response = await fetchWithMeta(url, { timeoutMs: 10000 });
      const findings = await findingsFor(response, pair.modules, { fetchRobots: true });
      for (const f of findings) produced.add(f.id);
      assert.deepEqual(
        asMap(findings),
        servedIds(pair, pair[side]),
        `${pair.name}/${side} over HTTP`,
      );
    }
  }
});

test('the served adjustments are both needed and neither is idle', async (t) => {
  // An adjustment nobody needs is an excuse, so each one is required to
  // actually appear in or vanish from a served result.
  const server = await startPairServer();
  t.after(() => server.close());

  const url = await server.select(PAIRS[0], 'before');
  const response = await fetchWithMeta(url, { timeoutMs: 10000 });
  const secIds = asMap(await findingsFor(response, ['security']));
  const seoIds = asMap(await findingsFor(response, ['seo'], { fetchRobots: true }));

  assert.equal(secIds['sec/no-https'], SERVED_ADDS['sec/no-https']);
  assert.equal(seoIds['seo/robots-missing'], SERVED_ADDS['seo/robots-missing']);
  for (const dropped of SERVED_DROPS) {
    assert.ok(!(dropped in secIds), `${dropped} should not be judged on a page without TLS`);
  }
  // And the direct drive of the same side does carry the HSTS finding, which
  // is what makes the drop an adjustment rather than a fact about the page.
  const direct = asMap(
    await findingsFor(responseFor(PAGE_PATH, await readSide(PAIRS[0], 'before')), ['security']),
  );
  assert.ok(SERVED_DROPS.some((id) => id in direct));
});

test('the pairs reach a recorded share of the catalogue, and the rest is reached elsewhere', () => {
  // The exact number matters less than the fact that it is written down.
  // Fifteen pairs cannot reach fifty four findings, and a repository that
  // pretends otherwise is hiding where its coverage comes from.
  const pairIds = allPairIds();
  for (const id of pairIds) {
    assert.ok(produced.has(id), `${id} is declared by a pair but was never produced`);
  }
  const reachable = new Set(REACHABLE_IDS);
  for (const id of pairIds) {
    assert.ok(
      reachable.has(id) || isCatalogued(id),
      `${id} is declared by a pair but is neither catalogued as reachable nor a member of an open family`,
    );
  }
  assert.equal(pairIds.length, 40, 'the recorded number of findings the pairs reach has moved');
  assert.ok(pairIds.length < reachable.size, 'the pairs are not the whole catalogue and must not claim to be');
});

test('the canonical origin the direct drive uses is the one the pages assume', () => {
  assert.ok(PAIR_ORIGIN.startsWith('https://'), 'the direct drive must present as TLS, or the HSTS drop is meaningless');
});

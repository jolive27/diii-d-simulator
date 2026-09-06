import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { validateCapabilityPolicy } from '../tools/capability-policy.mjs';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'capability-policy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const artifact = (name, text) => { fs.writeFileSync(path.join(root, name), text); return { path: name, sha256: hash(text) }; };
  const reference = { availability: 'available', implementations: [{ name: 'Established solver', versionOrRevision: 'release-1', source: 'https://example.org/solver', comparisonPlan: 'Compare profiles on a common grid and matched physical inputs with declared residual limits.' }] };
  const spec = { id: 'future', physicsCapabilityChange: true, requiredChecks: ['NEW-VERIFY'], physicsCapabilities: [{ id: 'new-capability', verification: { testPath: 'verification.test.mjs', checkName: 'NEW-VERIFY' }, experimentalValidationPlan: artifact('experimental.md', '# Experimental plan\nHeld-out measurements and residual assessment require Director scientific review.'), uncertaintyModel: artifact('uncertainty.md', '# Uncertainty\nInput uncertainty and model discrepancy will be evaluated independently.'), domainOfValidity: artifact('domain.md', '# Validity domain\nDocument supported plasma conditions and known breakdown limits.'), referenceComparison: artifact('reference.json', JSON.stringify(reference)) }] };
  artifact('verification.test.mjs', '// Verification test implementation, assessed by independent evidence gate.');
  const policy = { schemaVersion: 1, legacyApprovedSpecHashes: [] };
  return { root, spec, policy, artifact, reference, validate: (value = spec, phase = 'acceptance') => validateCapabilityPolicy(value, { root, policy, phase }) };
}
test('complete new capability and explicit no-change specification pass structural review', t => {
  const f = fixture(t); assert.equal(f.validate().status, 'PASS');
  assert.equal(f.validate({ physicsCapabilityChange: false, noPhysicsChangeRationale: 'Only navigation copy changes; equations and parameters are unchanged.' }).status, 'PASS');
  assert.equal(f.validate({ physicsCapabilityChange: false }).status, 'FAIL');
  assert.equal(f.validate({ physicsCapabilityChange: false, noPhysicsChangeRationale: 'No change', physicsCapabilities: f.spec.physicsCapabilities }).status, 'FAIL');
});
test('every mandatory capability item, explicit flag, and required verification check are enforced', t => {
  const f = fixture(t);
  for (const field of ['id', 'verification', 'experimentalValidationPlan', 'uncertaintyModel', 'domainOfValidity', 'referenceComparison']) {
    const copy = structuredClone(f.spec); delete copy.physicsCapabilities[0][field]; assert.equal(f.validate(copy).status, 'FAIL', field);
  }
  for (const value of [{}, { physicsCapabilityChange: 'true' }, { physicsCapabilityChange: true, physicsCapabilities: [] }]) assert.equal(f.validate(value).status, 'FAIL');
  const copy = structuredClone(f.spec); copy.requiredChecks = []; assert.equal(f.validate(copy).status, 'FAIL');
});
test('hash binding detects changed or empty artifacts', t => {
  const f = fixture(t); fs.appendFileSync(path.join(f.root, 'uncertainty.md'), '\nAltered.');
  assert.ok(f.validate().errors.some(value => value.includes('hash mismatch')));
  f.spec.physicsCapabilities[0].uncertaintyModel = f.artifact('uncertainty.md', '   ');
  assert.ok(f.validate().errors.some(value => value.includes('empty')));
});
test('unsafe paths and symlinks outside repository fail', t => {
  const f = fixture(t);
  for (const unsafe of ['../outside.md', '/tmp/outside.md', 'x/../../outside.md', 'x\\outside.md', 'file:outside.md']) {
    const copy = structuredClone(f.spec); copy.physicsCapabilities[0].domainOfValidity.path = unsafe;
    assert.ok(f.validate(copy).errors.some(value => value.includes('unsafe')), unsafe);
  }
  fs.symlinkSync(os.tmpdir(), path.join(f.root, 'escape'));
  f.spec.physicsCapabilities[0].verification.testPath = 'escape/planned-capability-test.mjs';
  assert.equal(f.validate(f.spec, 'approval').status, 'FAIL');
});
test('reference route needs implementation details or a documented no-reference search', t => {
  const f = fixture(t);
  const setReference = value => { f.spec.physicsCapabilities[0].referenceComparison = f.artifact('reference.json', JSON.stringify(value)); };
  for (const value of [{ availability: 'available', implementations: [] }, { availability: 'none_identified', rationale: 'None known' }, { availability: 'none_identified', rationale: 'None known', searchRecord: [{}] }, { availability: 'skip' }]) { setReference(value); assert.equal(f.validate().status, 'FAIL'); }
  setReference({ availability: 'none_identified', rationale: 'No maintained implementation with the required model was located; Director must review this conclusion.', searchRecord: [{ query: 'reference implementation of specified model', source: 'https://example.org/search-notes', date: '2026-09-06', result: 'Available projects do not implement the specified model; comparison alternatives documented.' }] });
  assert.equal(f.validate().status, 'PASS');
});
test('only exact approved historical hashes are grandfathered, never names', t => {
  const f = fixture(t), historical = { id: 'm02', requiredChecks: ['OLD'] };
  f.policy.legacyApprovedSpecHashes.push(hash(JSON.stringify(historical)));
  assert.deepEqual(f.validate(historical), { status: 'PASS', errors: [], legacyExemption: true });
  assert.equal(f.validate({ ...historical, additional: true }).status, 'FAIL');
  assert.equal(f.validate({ id: 'infrastructure' }).status, 'FAIL');
});
test('approval permits a safely planned test; acceptance requires the implemented file', t => {
  const f = fixture(t); fs.unlinkSync(path.join(f.root, 'verification.test.mjs'));
  assert.equal(f.validate(f.spec, 'approval').status, 'PASS');
  assert.equal(f.validate(f.spec, 'acceptance').status, 'FAIL');
  assert.equal(f.validate(f.spec, 'unknown').status, 'FAIL');
  // Supporting scientific artifacts must already exist before approval.
  fs.unlinkSync(path.join(f.root, 'domain.md')); assert.equal(f.validate(f.spec, 'approval').status, 'FAIL');
});

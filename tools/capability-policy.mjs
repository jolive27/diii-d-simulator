/** Mechanical completeness/integrity gate. Scientific adequacy requires Director review. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

// phase='approval' permits planned test files; acceptance requires implemented tests.
export function validateCapabilityPolicy(spec, { root, policy, phase = 'acceptance' }) {
  const errors = [];
  if (!['approval', 'acceptance'].includes(phase)) return {status:'FAIL', errors:['Unknown capability policy phase'], legacyExemption:false};
  const fail = message => { errors.push(message); return null; };
  if (!object(spec)) return { status: 'FAIL', errors: ['Specification must be an object'], legacyExemption: false };
  if (!object(policy) || policy.schemaVersion !== 1 || !Array.isArray(policy.legacyApprovedSpecHashes) || !policy.legacyApprovedSpecHashes.every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) {
    return { status: 'FAIL', errors: ['Missing or malformed capability policy'], legacyExemption: false };
  }
  if (policy.legacyApprovedSpecHashes.includes(digest(JSON.stringify(spec)))) return { status: 'PASS', errors: [], legacyExemption: true };
  if (typeof spec.physicsCapabilityChange !== 'boolean') errors.push('physicsCapabilityChange must be declared as a boolean');
  else if (!spec.physicsCapabilityChange) {
    if (!nonempty(spec.noPhysicsChangeRationale)) errors.push('A no-physics-change rationale is required');
    if (spec.physicsCapabilities !== undefined && (!Array.isArray(spec.physicsCapabilities) || spec.physicsCapabilities.length > 0)) errors.push('A no-change specification cannot declare physics capabilities');
  } else {
    function localFile(relative, label, planned = false) {
      if (!nonempty(relative) || path.isAbsolute(relative) || relative.includes('\\') || relative.split('/').some(part => part === '..' || part === '.' || part === '') || /^[a-z]+:/i.test(relative)) return fail(`${label}: unsafe repository path`);
      try {
        const repository = fs.realpathSync(root), candidate = path.join(repository, relative);
        if (planned && !fs.existsSync(candidate)) {
          let parent = path.dirname(candidate);
          while (!fs.existsSync(parent)) parent = path.dirname(parent);
          const realParent = fs.realpathSync(parent);
          if (realParent !== repository && !realParent.startsWith(repository + path.sep)) return fail(`${label}: planned path escapes repository`);
          return null;
        }
        const resolved = fs.realpathSync(candidate);
        if (!resolved.startsWith(repository + path.sep)) return fail(`${label}: path escapes repository`);
        if (!fs.statSync(resolved).isFile()) return fail(`${label}: expected a file`);
        const bytes = fs.readFileSync(resolved);
        if (!bytes.toString('utf8').trim()) return fail(`${label}: artifact is empty`);
        return bytes;
      } catch { return fail(`${label}: artifact missing or unreadable`); }
    }
    function artifact(ref, label) {
      if (!object(ref) || !nonempty(ref.path) || typeof ref.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256)) return fail(`${label}: requires path and SHA-256 binding`);
      const bytes = localFile(ref.path, label);
      if (bytes && digest(bytes) !== ref.sha256) return fail(`${label}: artifact hash mismatch`);
      return bytes;
    }
    if (!Array.isArray(spec.physicsCapabilities) || spec.physicsCapabilities.length === 0) errors.push('Physics changes require a nonempty physicsCapabilities array');
    const ids = new Set();
    for (const capability of Array.isArray(spec.physicsCapabilities) ? spec.physicsCapabilities : []) {
      if (!object(capability) || !nonempty(capability.id)) { errors.push('Each physics capability requires an id'); continue; }
      const prefix = `Capability ${capability.id}`;
      if (ids.has(capability.id)) errors.push(`${prefix}: duplicate id`);
      ids.add(capability.id);
      if (!object(capability.verification) || !nonempty(capability.verification.testPath) || !nonempty(capability.verification.checkName)) errors.push(`${prefix}: verification requires testPath and checkName`);
      else {
        localFile(capability.verification.testPath, `${prefix} verification test`, phase === 'approval');
        if (!Array.isArray(spec.requiredChecks) || !spec.requiredChecks.includes(capability.verification.checkName)) errors.push(`${prefix}: verification check is not in requiredChecks`);
      }
      for (const field of ['experimentalValidationPlan', 'uncertaintyModel', 'domainOfValidity']) {
        artifact(capability[field], `${prefix} ${field}`);
        if (object(capability[field]) && nonempty(capability[field].path) && !/\.md$/i.test(capability[field].path)) errors.push(`${prefix} ${field}: expected a Markdown artifact for Director review`);
      }
      const bytes = artifact(capability.referenceComparison, `${prefix} referenceComparison`);
      if (bytes) {
        let comparison;
        try { comparison = JSON.parse(bytes.toString('utf8')); } catch { errors.push(`${prefix}: referenceComparison must contain structured JSON`); }
        if (comparison !== undefined) {
          if (!object(comparison)) errors.push(`${prefix}: referenceComparison must be an object`);
          else if (comparison.availability === 'available') {
            if (!Array.isArray(comparison.implementations) || comparison.implementations.length === 0 || !comparison.implementations.every(item => object(item) && ['name', 'versionOrRevision', 'source', 'comparisonPlan'].every(key => nonempty(item[key])))) errors.push(`${prefix}: an available reference requires at least one named/versioned implementation, source, and comparison plan`);
          } else if (comparison.availability === 'none_identified') {
            if (!nonempty(comparison.rationale) || !Array.isArray(comparison.searchRecord) || comparison.searchRecord.length === 0 || !comparison.searchRecord.every(item => object(item) && ['query', 'source', 'date', 'result'].every(key => nonempty(item[key])))) errors.push(`${prefix}: no-reference exception requires rationale and dated search records with query, source, and result`);
          } else errors.push(`${prefix}: reference availability must be available or none_identified`);
        }
      }
    }
  }
  return { status: errors.length ? 'FAIL' : 'PASS', errors, legacyExemption: false };
}

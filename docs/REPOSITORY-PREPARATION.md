# Local repository preparation — 2026-09-06

## Scope and preserved state

Prepared the existing Desktop `DIII-D-Simulator` repository locally. Git was already initialized, with M01, infrastructure and M02 commits. Existing history is retained; no reinitialization, squashing or history rewrite was performed. No Git remote was configured at the start of preparation. No GitHub repository was created and nothing was pushed, published or deployed.

The current structure already separates application/UI, physics, agents, science, specifications, tests, validation and experiments. These paths were retained to avoid changing imports, regression provenance or protected source fingerprints. No physics equations, defaults, API behavior, baselines, agent permissions or gate implementations were changed by repository preparation. Separately authorized policy/dashboard changes from the concurrent development task are retained in their own commit.

Preparation changes:

- Expanded `README.md` with accurate status, architecture, portable run commands, agent workflow, acceptance requirements, numerical/experimental distinctions and licensing limits.
- Expanded `.gitignore` for credentials/environment files, dependencies, caches, build outputs, scratch work, disposable simulation exports, archives and common experimental array/data formats.
- Retained the existing three-file synthetic run under `experiments/runs/` with explicit ignore exceptions because the append-only audit references it. Future run exports are ignored. Retained the small recorded validation build log as evidence; no artifacts were deleted or untracked.
- Added this record and publication guidance. No blanket `LICENSE` was invented.

## What belongs in version control

Keep source, lockfiles, role contracts, approved specifications, scientific registries, curated synthetic examples, frozen M01 baselines, persistent experiment records, and independent validation executors/evidence/reports/decisions. The largest baseline is approximately 4.6 MB and is needed for exact regression verification. The saved `public/validation-*.json` dashboard snapshots are intentional application assets. Evidence `.tap` files are intentional records, not disposable logs.

New raw runs go under ignored `experiments/runs/` or `experiments/results/`. Private/restricted experimental data belongs outside Git or under ignored `data/private/`, `data/restricted/`, `data/raw/` or `data/experimental/`. Common HDF5, NetCDF, MATLAB, NumPy and archive extensions are ignored as a second precaution. Do not force-add such files without reviewing provenance, redistribution rights and size. There is no automatic size limit in `.gitignore`.

Ignore rules do not remove previously committed material and are not a credential detector. A future secret found in history must be handled before pushing; merely deleting the working file is insufficient.

## Audit and remaining publication concerns

A local read-only review covered tracked/current candidate files and reachable Git history. Secret-pattern scanning found no likely embedded API tokens, private keys or password assignments; this is a bounded review, not a guarantee that all secrets are detectable. No private measured DIII-D shot dataset was identified. The included numerical fixtures are synthetic model outputs with recorded provenance.

What was done before publishing, and what was deliberately left alone:

- Personal absolute paths in tracked files were replaced with `~`. The Desktop launcher and the hosted-site shortcuts were removed; `pnpm dev` is the portable route.
- Agent lane transcripts under `experiments/teamflow/runs/` are ignored going forward. The durable audit trail is `validation/` and `experiments/records/`.
- First-phase agent settings (`.codex/`) were removed from the tree. Records and evidence that name the models used in that phase are provenance and were not edited.
- History was not rewritten. The acceptance records are bound to commit hashes and source fingerprints, and a rewrite would invalidate them. Commit metadata and old versions may still contain a personal name or path; that is a known and accepted trade-off.
- The hosting configuration (`.openai/hosting.json` and the Sites Vite plugin) is handled on its own branch, because removing it changes the build and needs a local `pnpm dev` check first. It participates in the infrastructure validation fingerprint, so removing it is expected to show that historical report as stale.

Never change scientific artifacts or replace evidence hashes to make a gate pass.

## Licensing decision

No repository-wide license was present or added. Confirm ownership/permission for the original code and review inherited Sites starter/UI components, assets and dependency notices before selecting a license. Dependency package licenses do not automatically license the whole project. Preserve required third-party notices and make any required attribution explicit. No permission to redistribute DIII-D experimental data is assumed, and the DIII-D name does not imply endorsement.

## Validation and next GitHub step

Use the current gate to distinguish historical acceptance from current evidence:

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm build
node tools/milestone-status.mjs
node tools/workflow.mjs gate m02
```

Infrastructure acceptance is a historical prerequisite and its fingerprint naturally predates M02. Do not change its old report simply to make its current-source check pass. Current M02 evidence must match the protected source. Preparation changes to root README, ignore rules and this documentation do not enter that protected fingerprint.

After reviewing the privacy and license decisions, supply the URL of an empty GitHub repository you control and explicitly authorize the push. Prefer a private repository until those decisions are resolved. Do not initialize the remote with a separate README, license or ignore file; that would introduce unrelated history. The local branch is recorded in the final preparation report. If it is `main`, the intended commands are:

```sh
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Replace the URL with the actual repository URL. Authenticate through a credential manager or SSH; never embed tokens in the URL. These commands are documentation only and were not executed. If a remote already exists by then, inspect it before changing anything. If the remote is nonempty, reconcile history without a force push.

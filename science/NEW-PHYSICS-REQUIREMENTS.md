# Required evidence for every new physics capability

This is a mandatory project rule from the user. It applies to additions and expansions of physics capability. Changing a model's assumptions, closures or claimed validity must be explicitly classified and reviewed, not disguised as maintenance.

Before approving implementation, the Director must review all five elements below. Before accepting the capability, independent Validation must confirm the verification test passes and assess the adequacy and truthful status of all four supporting artifacts. Plans are not completed validation, and comparison pathways are not completed comparisons.

1. **Verification test.** Name an executable test and acceptance check; specify equations/identities, units, known solutions or conservation properties, inputs and quantitative tolerances. Save test results against the implemented model and source version. Test the new capability, not only an unrelated existing test.
2. **Experimental validation plan.** Identify measured observables, candidate experimental datasets or acquisition plan, diagnostic uncertainties, calibration/validation separation, parameter matching, comparison metrics, acceptance criteria, data-access dependencies and current execution status. State what measurements would falsify the model. A plan may be pending data; the capability must remain labeled experimentally unvalidated until evidence exists.
3. **Uncertainty model.** Describe numerical, parameter, measurement and model-form uncertainty; distributions, bounds or discrepancy terms; correlations; estimation/provenance; propagation to observables; and sensitivity and calibration methods. Unsupported quantities remain explicitly unknown, never assigned invented precision. Define how uncertainty changes predictions and how coverage or bounds will be checked.
4. **Domain of validity.** Document geometry, species, assumptions, parameter ranges with units, relevant dimensionless regimes, spatial/time resolution, initial/boundary conditions, excluded phenomena, breakdown criteria, and explicit behavior outside the domain. Distinguish assumed from verified ranges.
5. **Established implementation comparison pathway.** Where available, identify at least one established implementation by name, version/revision and authoritative source. Map equations, conventions, units, boundary conditions, inputs and observables; define matched benchmark cases, metrics/tolerances, execution/access requirements, expected differences and limitations. Keep reference-implementation comparison separate from experimental validation. If none is identified, provide a dated search record and scientific rationale for explicit Director review. Lack of local installation, license or data access alone is not evidence that no reference exists.

## Persistent contract

Every future specification declares `physicsCapabilityChange`. If true, it lists each capability with its verification check and SHA256-bound supporting artifacts. If false, a substantive `noPhysicsChangeRationale` is required. Physics authors the scientific package; Software implements the approved tests/model; independent Validation reviews evidence and adequacy; Director alone approves and accepts. Changing a supporting artifact requires a newly approved specification hash.

Machine checks enforce completeness, artifact hashes, test references and reference-pathway structure. They cannot determine scientific adequacy; the separate Physics, Validation and Director reviews remain mandatory. A boilerplate template or named test with no relevant scientific content is not sufficient.

The two previously approved infrastructure/M02 specifications remain historical records, exempt only by their exact hashes in capability-policy.json. This does not retroactively claim that the educational M01 model has an uncertainty model or experimental validation. No new physics capability or Milestone 03 is authorized by this policy update.

## Approval and acceptance phases

At implementation approval, the named verification test may still be a planned repository path; its check must already be in `requiredChecks`, and the four scientific artifacts must exist and match their recorded hashes. At acceptance, the test file must exist and independent passing evidence is required. New Director approvals record `capabilityPolicyReview.status: REVIEWED`; this records the Director's scientific-review responsibility and does not replace it with automated text evaluation.

A deliberately incomplete template is available at specs/templates/new-physics.example.json. It will not pass the gate until real reviewed artifacts and hashes replace its placeholders. Reference-comparison artifacts use structured JSON: `availability: available` plus `implementations` entries containing name, versionOrRevision, source and comparisonPlan; or `availability: none_identified` with rationale and dated searchRecord entries (query, source, date, result).

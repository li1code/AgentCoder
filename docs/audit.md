# AutoCoder: Repository-Wide Contract and Validator Remediation Plan

**Repository:** `Gautam-Mathur/AutoCoder`  
**Audited commit:** `9e7985091233ed55596b49723534d090cef20326`  
**Audit date:** 2026-10-20

## 1. Executive summary

The repository contains several overlapping validation layers for architecture, stage contracts, workspace authorization, artifact acceptance, and repair execution.

The main remediation objective is to establish **one canonical interpretation of each contract**, make security-sensitive decisions fail closed, and prove that runtime behavior matches the declared contracts.

### Priority classification

| Priority | Issue                                                                 | Primary location                                                                                                 |
| -------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| P0       | Control-plane artifact classification can rely on basename alone      | `workspace-policy.ts`                                                                                            |
| P0/P1    | Repair idempotency, budgets, and recovery require durable enforcement | `repair-coordinator.ts`                                                                                          |
| P1       | Duplicate architecture parsers can disagree                           | `architecture-parser.ts`, `spec-contract.ts`                                                                     |
| P1       | Framework-specific validation is too broad                            | `architecture-file-policy.ts`, `spec-contract.ts`                                                                |
| P1       | Architecture tree, inventory, and ownership are redundant             | `registry/Architect.ts`, `architecture-parser.ts`                                                                |
| P1       | Accepted artifacts and VFS projections have separate lifecycles       | `artifact-store.ts`                                                                                              |
| P1       | Stage contracts can drift from runtime orchestration                  | `contracts/versions.ts`, `contracts/registry.ts`, `contracts/stage-graph.ts`, `orchestrator.ts`, `final-gate.ts` |
| P1       | Trusted approver registry defaults to process-local memory            | `security-gate.ts`                                                                                               |
| P2       | Path normalization is inconsistent                                    | `workspace-policy.ts`, `spec-contract.ts`, `vfs.ts`, `toolbox.ts`                                                |
| P2       | Reviewer validation does not establish evidence grounding             | `contracts/schemas/reviewer.ts`                                                                                  |
| P2       | Unknown file types silently default to implementation                 | `architecture-file-policy.ts`                                                                                    |
| P1       | Test coverage needs stronger proof of runtime wiring                  | `contracts/__tests__/*`                                                                                          |

These are source-review findings and risks. The test suite was not executed during this audit, so runtime outcomes and test counts remain unverified.

## 2. Detailed findings

### F-01. Control-plane artifact detection can misclassify nested project files

**Priority:** P0  
**File:** `src/lib/agents/ruflo/workspace-policy.ts`  
**Function:** `isControlPlaneArtifact()`

The implementation checks the full normalized path and its basename. Consequently, a nested path such as `src/features/plan.md` can be classified as a pipeline artifact merely because the filename is `plan.md`.

**Remediation**

- Match reserved pipeline artifacts against exact canonical paths.
- Remove basename-based privilege classification.
- Use the same path classification for all readers, writers, and validation gates.

**Required tests**

- Root `plan.md` is classified as a pipeline artifact.
- Nested `src/features/plan.md` is classified as project content.
- Nested manifests do not gain control-plane privileges through their names.
- Traversal paths are rejected.

### F-02. Architecture parsing has multiple grammars

**Priority:** P1  
**Files:** `architecture-parser.ts`, `spec-contract.ts`

`architecture-parser.ts` supports multiple module-heading formats. The separate `parseArchitectureModules()` implementation in `spec-contract.ts` accepts a narrower bold-label format. Both independently parse module ownership and related fields.

This means two validators can interpret the same Markdown differently.

**Remediation**

1. Make `architecture-parser.ts` the sole architecture parser.
2. Remove duplicate parsing logic or convert it into an adapter over the canonical result.
3. Return a single normalized representation of modules, paths, and ownership.
4. Add parity tests before removing the legacy parser.

**Required tests**

- Every public architecture-validation API returns the same normalized ownership map.
- Supported heading formats are accepted consistently.
- Unsupported formats produce one clear parser error instead of different downstream failures.

### F-03. Framework-specific rules are applied too broadly

**Priority:** P1  
**Files:** `architecture-file-policy.ts`, `spec-contract.ts`

Files named `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`, or `not-found.tsx` can be classified as framework files regardless of the project's declared framework. Next.js dynamic-segment validation also needs to be gated on a Next.js routing contract.

**Remediation**

- Pass framework and router context into file classification.
- Apply App Router rules only to recognized Next.js App Router roots.
- Handle Pages Router rules separately.
- Apply dynamic-segment checks only to actual Next.js routes.
- Keep ownership mandatory for normal implementation files.

**Required tests**

- A correctly owned `src/app/layout.tsx` passes in a Next.js App Router project.
- A generic `src/components/layout.tsx` is not automatically treated as an App Router special file.
- Non-Next projects do not receive Next-specific route errors.
- Invalid Next.js route segments still fail.

### F-04. Architecture repeats the same file information in multiple sections

**Priority:** P1  
**Files:** `registry/Architect.ts`, `architecture-parser.ts`, `spec-contract.ts`

The architecture document repeats file declarations in the folder tree, Project Files inventory, and module ownership lists. Each representation can become inconsistent with the others.

This is the direct architectural pattern behind the recurring unclaimed-file error.

**Remediation**

- Prefer a single canonical file manifest.
- Generate the tree and inventory from that manifest when possible.
- If Markdown remains the interface, parse it once and report tree, inventory, and ownership mismatches together.
- Make retries amend only the affected file entries.
- Do not remove ownership validation to hide incomplete architecture output.

**Required tests**

- `src/app/layout.tsx` passes when listed and owned exactly once.
- The same file fails when genuinely unowned.
- Duplicate ownership produces a separate diagnostic.
- Missing inventory entries and stale ownership entries produce distinct errors.

### F-05. Path normalization is inconsistent across modules

**Priority:** P2  
**Files:** `architecture-parser.ts`, `spec-contract.ts`, `workspace-policy.ts`, `vfs.ts`, `toolbox.ts`

Different code paths normalize slashes, quotes, leading prefixes, and letter case differently. Some comparisons lowercase paths while other structures preserve the original case.

**Remediation**

- Introduce one strict canonical path-validation function.
- Reject absolute paths, traversal, drive prefixes, and invalid paths instead of silently converting them.
- Define case-sensitivity rules once.
- Use canonical paths for duplicate checks, ownership, authorization, manifests, and file-set hashes.

**Required tests:** Slash direction, repeated separators, `./`, traversal, absolute paths, case-only collisions, Unicode, and duplicate paths.

### F-06. Artifact acceptance and VFS projection are separate operations

**Priority:** P1  
**File:** `artifact-store.ts`  
**Functions:** `commitAcceptedArtifact()`, `reconcilePendingProjections()`

The database can record an artifact as accepted with a pending projection before the VFS write and synchronization update complete. Recovery therefore depends on correct reconciliation and on downstream consumers respecting projection status.

**Remediation**

- Define explicit artifact lifecycle states.
- Decide whether downstream stages consume authoritative database content or require a synchronized VFS projection.
- Make reconciliation aware of run ID, artifact version, content hash, and current accepted lineage.
- Prevent stale artifacts from overwriting newer accepted state.
- Add idempotency and concurrency protection to artifact commits.

**Required tests**

- Recovery after a crash between database commit and VFS write.
- Stale pending artifacts cannot overwrite newer artifacts.
- Concurrent commits cannot produce inconsistent accepted versions.
- Final-gate handling of unsynchronized mandatory artifacts is deterministic.

### F-07. Stage contract metadata can drift from runtime execution

**Priority:** P1  
**Files:** `contracts/versions.ts`, `contracts/registry.ts`, `contracts/stage-graph.ts`, `orchestrator.ts`, `final-gate.ts`

The repository declares stage versions, output artifacts, dependencies, execution order, and final-gate requirements in separate places.

**Remediation**

- Derive orchestration, invalidation, and final-gate expectations from one canonical stage specification.
- Model conditional stages such as Debugger explicitly.
- Add invariants covering every stage's contract, artifact, parser, validator, prompt version, and dependencies.

**Required tests**

- Every mandatory final-gate stage has a runtime producer.
- Conditional stages have explicit activation conditions.
- Changing an artifact name fails CI until all consumers are updated.

### F-08. Repair durability, idempotency, and budgets need end-to-end enforcement

**Priority:** P0/P1  
**File:** `repair-coordinator.ts`

The attempt constructor uses `Date.now()` in its attempt ID and includes that ID in the idempotency key. Crash reconciliation accepts a process-local `Map` of receipts. These helpers alone do not establish durable recovery or stable idempotency.

**Remediation**

- Build idempotency keys from stable operation identity, including run, workspace, normalized failures, base revision, plan digest, and authorized targets.
- Persist attempts, receipts, budget counters, cancellation state, and transitions.
- Reconcile authoritative commit state before retrying.
- Enforce budgets at actual model, tool, and write call sites.
- Fail closed if authorization policy cannot load.
- Prevent new writes after cancellation and define how in-flight mutations are handled.

**Required tests**

- Retries after restart preserve logical idempotency.
- Existing commit receipts prevent patch reapplication.
- Missing authorization policy causes zero mutation calls and zero writes.
- Concurrent attempts cannot overspend budgets.
- Deadline, attempt, model-call, tool-call, conflict, and cancellation limits are enforced.

### F-09. Trusted approvers are stored in process-local memory by default

**Priority:** P1  
**File:** `security-gate.ts`

The default trusted approver registry uses an in-memory `Map`. The interface supports an external authority service, but process-local state is not persistent or shared across workers.

**Remediation**

- Require an explicit production authority service for release exceptions.
- Keep the in-memory registry for development and tests only.
- Persist approver status, public keys, permitted checks, expiry, and revocation state.
- Fail closed if authority cannot be verified.
- Audit every exception decision.

**Required tests:** Restart behavior, cross-instance revocation, missing authority, expired exceptions, incorrect run/workspace/check bindings, and forged signatures.

### F-10. Reviewer format checks do not prove findings are evidence-based

**Priority:** P2  
**File:** `contracts/schemas/reviewer.ts`

The parser checks required headings, score range, PASS/FAIL prefixes, workspace hash, and non-empty findings. The Findings section is returned as a single string, so evidence grounding is not structurally verified.

**Remediation**

- Require structured findings with stable IDs, severity, claim, evidence type, and evidence reference.
- Validate evidence against current files, tests, requirements, and workspace fingerprint.
- Make PASS/FAIL consistent with blocking findings and deterministic gate results.

**Required tests:** Missing evidence, nonexistent file references, stale hashes, and conflicting PASS/blocking findings.

### F-11. Markdown parsing is brittle and duplicated

**Priority:** P2  
**Files:** `contracts/markdown-sections.ts`, `architecture-parser.ts`, `workspace-policy.ts`, stage-specific parsers

Parsers rely on exact heading levels and field formats, and not all parsers use identical Markdown handling.

**Remediation**

- Define one grammar per artifact.
- Parse each artifact into a structured object once.
- Normalize equivalent formatting only where safe.
- Provide targeted errors with accepted examples.
- Add fixtures from historical failed model outputs.

**Required tests:** CRLF/LF, headings inside fenced code blocks, formatting variations, duplicate headings, and malformed fields.

### F-12. Unknown file classes default to implementation

**Priority:** P2  
**File:** `architecture-file-policy.ts`

After checking known configurations, schemas, documentation, assets, and framework files, unrecognized paths default to `implementation`.

**Remediation**

- Make classification data-driven and framework-aware.
- Separate ownership requirements from coder-generation and stage-mutation permissions.
- Keep unknown source-like files ownership-required, but make unknown non-source types explicitly unclassified rather than silently guessing.

**Required tests:** Representative Next.js, Vite, Node, Python, static HTML, Prisma, test, generated, and lockfile paths.

### F-13. Tests must prove runtime wiring, not just helper behavior

**Priority:** P1  
**Location:** `src/lib/agents/ruflo/contracts/__tests__/`

The repository has substantial remediation suites, but test names and isolated helper assertions do not alone prove production wiring, restart safety, or complete mutation-boundary coverage.

**Remediation**

- Map every invariant to its implementation, callers, unit tests, integration tests, and failure-injection tests.
- Exercise actual coordinator, VFS, tool, and pipeline paths.
- Test legacy exports and all write-capable entry points.
- Run CI from a clean checkout and record exact commands, counts, and commit SHA.

**Required integration scenario:** Queen → Planner → Architect → Blueprinter → Coder → Tester → conditional Debugger → Security/Reviewer → final gate, including injected parser errors, projection failures, policy-load failures, concurrent writes, lease expiry, and restart recovery.

---

## 3. Implementation order

### Phase 0: Baseline

- [ ] Record commit SHA, dependency state, and lockfile.
- [ ] Run typecheck, lint, unit tests, integration tests, and build.
- [ ] Capture exact commands and failures.
- [ ] Map every write-capable entry point and artifact-acceptance path.

### Phase 1: Security boundaries

- [ ] Fix control-plane basename classification (F-01).
- [ ] Centralize strict path validation (F-05).
- [ ] Fail closed on repair policy errors and enforce budgets at call sites (F-08).
- [ ] Require production-backed authority for release exceptions (F-09).
- [ ] Add negative security tests.

### Phase 2: Contract convergence

- [ ] Remove duplicate architecture parsing (F-02).
- [ ] Make framework classification context-aware (F-03).
- [ ] Consolidate file manifest, tree, inventory, and ownership (F-04).
- [ ] Add parser fixtures and precise diagnostics (F-11, F-12).

### Phase 3: Runtime lifecycle

- [ ] Derive orchestration and final-gate expectations from one stage graph (F-07).
- [ ] Make artifact projection/reconciliation idempotent and run-aware (F-06).
- [ ] Persist repair state, receipts, budgets, and cancellation (F-08).
- [ ] Add restart and concurrency tests.

### Phase 4: Evidence and CI

- [ ] Add structured, evidence-backed Reviewer findings (F-10).
- [ ] Create invariant-to-test traceability (F-13).
- [ ] Add CI checks for prompt/schema/parser/registry/stage-graph drift.
- [ ] Keep regression fixtures for `src/app/layout.tsx` and related framework files.

---

## 4. Definition of done

- Every architecture validation path produces the same normalized parse result.
- `src/app/layout.tsx` passes when owned exactly once and fails only when ownership is genuinely absent or duplicated.
- Non-Next projects do not receive Next-specific routing constraints.
- Nested project files named `plan.md` do not receive control-plane privileges by basename.
- Every mutation uses one canonical path policy and fails closed when policy cannot load.
- Repair idempotency, budgets, cancellation, and recovery survive restarts and concurrent attempts.
- Runtime orchestration and final gate are checked against the same stage graph.
- Unsynchronized or stale artifacts cannot be consumed as current.
- Reviewer findings are traceable to evidence and the current workspace fingerprint.
- CI passes from a clean checkout, with results recorded against the final commit SHA.

## Audit limitations

This plan is based on source inspection at the listed commit. Code was not modified and the test suite was not executed during this pass. Priority labels indicate risk and remediation order, not proof of a production exploit. Re-check `main` before implementation if the repository has advanced.

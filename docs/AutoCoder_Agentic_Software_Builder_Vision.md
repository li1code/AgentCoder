# AutoCoder: End Goal and Product Vision

## An Agentic Software Builder with Bounded Autonomy

**Purpose:** Define AutoCoder's target state, core architectural
principles, and roadmap from a hybrid agent pipeline to a reliable
agentic software builder.

**Repository baseline discussed:**
`9e7985091233ed55596b49723534d090cef20326`\
**Status:** Target-state vision, not a claim that every capability
described below is already implemented.

------------------------------------------------------------------------

## 1. Executive Summary

AutoCoder should evolve into an **agentic software builder** that can
take a software goal, inspect a project, plan and implement changes, use
tools, diagnose failures, repair defects, verify outcomes, and report
results with traceable evidence.

It should be neither a collection of chatbots that produce code-shaped
text nor an unconstrained agent that repeatedly calls models and edits
files until something appears to work.

The target combines:

-   **Adaptive problem-solving:** Choose the next useful action based on
    evidence, task state, uncertainty, and prior results.
-   **Deterministic control:** Enforce permissions, budgets, state
    transitions, validation, and acceptance criteria in ordinary code.
-   **Evidence-grounded execution:** Tie decisions to the actual
    workspace, diagnostics, test results, and versioned artifacts.
-   **Bounded autonomy:** Limit time, model calls, tool calls, retries,
    mutation scope, and risk.
-   **Recoverability:** Reconcile interrupted or ambiguous operations
    instead of blindly repeating them.
-   **Accountability:** Record what was planned, changed, executed,
    observed, accepted, rejected, and why.

> **Core principle: Make the control plane deterministic and the
> problem-solving strategy adaptive.**

## 2. Product Goal

A user should be able to ask AutoCoder to build an application from a
specification, add a feature, fix a defect, refactor a module, resolve
failing checks, or review a repository. AutoCoder should manage the
bounded engineering workflow rather than merely suggest the next
command.

For an authorized task, it should:

1.  Interpret the goal and identify material ambiguity.
2.  Inspect the project and establish a versioned baseline.
3.  Derive requirements and explicit acceptance criteria.
4.  Plan and revise the plan as evidence changes.
5.  Delegate bounded work to specialist agents and tools.
6.  Mutate only authorized files and resources.
7.  Run deterministic checks and inspect their actual outputs.
8.  Diagnose failures and choose an appropriate next action.
9.  Repair and re-test within policy and budget.
10. Deliver a report of changes, evidence, limitations, and remaining
    risks.

Success means the requested outcome is supported by verifiable evidence,
not merely that an agent says it is finished. A completion report should
state what changed, which checks actually ran, what passed or failed,
which criteria remain unverified, whether exceptions were used, and what
limits affected the result.

## 3. What "Agentic" Means

Agentic behavior is not measured by the number of agents or model calls.
It is demonstrated by a closed loop:

1.  **Observe** task state, workspace, tool outputs, diagnostics, and
    prior actions.
2.  **Model** requirements, dependencies, constraints, and uncertainty.
3.  **Choose** the next useful action within policy and budget.
4.  **Act** through authorized tools.
5.  **Verify** the outcome against explicit criteria.
6.  **Update** the plan and state based on evidence.
7.  **Stop or escalate** when complete, blocked, over budget, unsafe, or
    no longer making progress.

The model may propose an action; deterministic policy code decides
whether that action is valid, permitted, and affordable.

  -----------------------------------------------------------------------
  Chatbot-like behavior               Intended AutoCoder behavior
  ----------------------------------- -----------------------------------
  Produces a plausible patch          Executes an authorized workflow and
                                      verifies it

  Repeats a fixed sequence            Selects the next action from
                                      current evidence

  Treats its own claim as proof       Uses actual compiler, test, tool,
                                      and repository outputs

  Retries without a stopping rule     Enforces shared budgets and retry
                                      limits

  Infers edit scope from loose text   Validates a structured plan against
                                      authorized scope

  Declares success from generated     Requires acceptance evidence
  output                              

  Repeats mutations after a crash     Reconciles operation state before
                                      retrying

  Silently expands the task           Requires explicit authorization for
                                      scope changes
  -----------------------------------------------------------------------

A fixed pipeline can contain agents, but it is not sufficiently adaptive
by itself. The goal is a **bounded adaptive controller around
deterministic execution and verification**.

## 4. Architectural Principles

### 4.1 Adaptive reasoning, deterministic control

**Adaptive reasoning plane** - Interpret requirements and propose
plans. - Choose among permitted actions. - Diagnose evidence and
generate repair hypotheses. - Revise strategy when results contradict
expectations. - Estimate uncertainty and identify when human input is
needed.

**Deterministic control plane** - Enforce authorization and file
boundaries. - Validate structured agent outputs. - Track task and
workspace versions. - Apply budgets and retry limits. - Execute tools
through known interfaces. - Validate state transitions. - Record
mutations and commit receipts. - Evaluate acceptance and release
gates. - Stop invalid or unsafe actions regardless of model confidence.

The reasoning plane can be flexible. The control plane must be
enforceable and testable without relying on the model to obey
instructions.

### 4.2 Evidence over assertion

Agent messages are proposals or interpretations, not authoritative
proof. "The build passed" requires a real build result. "This file is in
scope" requires authorization evidence. "The change is fixed" requires
relevant verification. "The write did not commit" must be established
from authoritative state, not guessed after a timeout.

### 4.3 Least privilege and explicit scope

Every action has a defined scope. File mutations, shell commands,
network access, package installation, secrets access, and release
operations are governed by explicit policy. Failed plans do not
automatically grant broader permissions.

### 4.4 Mandatory budgets

Every run has enforced limits for: - Wall-clock time. - Model
invocations and, where measurable, token/cost usage. - Tool
invocations. - Repair attempts and conflict retries. - Verification
runs. - Per-tool or per-action limits where needed.

A budget object that exists but is not consumed and checked on every
execution path is not an enforced budget. Parallel work must reserve
from a concurrency-safe shared budget. Retries and nested calls count.

### 4.5 Explicit stopping behavior

Stop or escalate when: - Required acceptance criteria are met. -
Information or permissions are missing. - A budget or deadline is
exhausted. - Repeated attempts produce no meaningful progress. -
Evidence is contradictory or insufficient. - Workspace state changes
unexpectedly. - Risk exceeds the approved level. - A mutation outcome
cannot be reconciled.

Stopping safely is a valid outcome.

## 5. Target Architecture

``` text
User Goal / Specification
          |
          v
Task Intake + Acceptance Criteria
          |
          v
Workspace Discovery + Versioned Baseline
          |
          v
Adaptive Agent Coordinator <----------+
          |                           |
          v                           |
Structured Action Proposal            |
          |                           |
          v                           |
Deterministic Policy + Budget Gate    |
          |                           |
          v                           |
Authorized Agent / Tool Execution     |
          |                           |
          v                           |
Evidence Collection                   |
          |                           |
          v                           |
Verification + State Update -----------+
          |
          +----> Complete and Report
          +----> Escalate / Await Approval
          +----> Stop Safely
```

Major components: 1. **Task intake:** Normalize the goal, constraints,
and acceptance criteria. 2. **Workspace model:** Capture repository
identity, relevant files, dependencies, and revision/fingerprint. 3.
**Adaptive coordinator:** Choose the next action from state, evidence,
uncertainty, and remaining budget. 4. **Agent/tool adapters:** Expose
specialist roles through controlled interfaces. 5. **Policy
enforcement:** Validate permissions, scope, command policy, risk, and
approval requirements. 6. **Budget manager:** Reserve and consume budget
before execution. 7. **Mutation manager:** Apply validated changes and
record durable operation state. 8. **Verification engine:** Run required
checks and map results to acceptance criteria. 9. **Recovery manager:**
Reconcile interrupted operations and ambiguous commit outcomes. 10.
**Audit/reporting:** Record decisions, evidence, mutations, exceptions,
and final status.

## 6. Agent Roles and Contracts

Agents are bounded workers with explicit contracts. Their names alone do
not establish that the system is agentic.

### Architect

**Purpose:** Convert requirements into design, module responsibilities,
dependencies, and file ownership.\
**Output:** Requirements mapping, design decisions, expected files,
dependencies, assumptions, and open questions.\
**Controls:** Schema validation, ownership coverage, dependency
consistency. It cannot silently expand scope.

### Coder

**Purpose:** Implement a narrowly defined change against an approved
plan.\
**Output:** Proposed edits, target paths, requirement links, and
rationale.\
**Controls:** Authorized paths, patch validation, workspace freshness,
compilation, and relevant tests. It cannot declare its own output
verified.

### Tester

**Purpose:** Execute verification and report observed results.\
**Output:** Checks run, commands, exit status, evidence,
acceptance-criteria coverage, and unverified areas.\
**Controls:** Validate result parsing and artifact presence. Skipped
checks are not passes.

### Debugger

**Purpose:** Analyze concrete failures and propose evidence-backed
repair targets.\
**Output:** Failure IDs, supporting evidence, hypotheses, target paths,
and a structured repair plan.\
**Controls:** Schema validation, valid failure IDs, normalized paths,
workspace fingerprint, and authorization. Free-form Markdown must not
grant mutation authority.

### Coordinator

**Purpose:** Select the next permitted action, coordinate workers,
allocate budget, and decide whether to continue, finish, or escalate.\
**Output:** Structured action proposal and evidence-based rationale.\
**Controls:** Policy decisions, budget enforcement, valid state
transitions, stopping conditions, and audit records.

Optional future roles include security analysis, code review, dependency
analysis, documentation, UI verification, and performance analysis. Add
a role only when it delivers distinct value. Each role adds cost,
latency, and coordination complexity.

## 7. Adaptive Action Selection

The coordinator should move beyond a fixed cycle such as Tester →
Debugger → Coder → Tester. It should choose from a finite set of
permitted actions, for example:

`inspect_workspace`, `clarify_requirement`, `analyze_failure`,
`design_change`, `implement_change`, `run_targeted_test`,
`run_full_verification`, `review_diff`, `repair_failure`,
`reconcile_operation`, `request_approval`, `complete`, `stop`.

Every proposal should include: - Objective and evidence motivating the
action. - Preconditions, inputs, and expected outputs. - Affected files
or systems. - Expected cost and budget reservation. - Risk category and
approval requirement. - Success and failure conditions.

The deterministic controller validates the proposal before execution.
Invalid proposals are rejected or returned for correction.

Progress should be measured through observable signals: acceptance
criteria completed, failures resolved, hypotheses eliminated by
evidence, dependencies completed, or meaningful reduction in
uncertainty. Repeating explanations for the same failure is not
progress. At a configured stagnation threshold, change strategy, ask for
help, or stop.

## 8. Evidence and Task State

AutoCoder should maintain structured task state rather than relying on
an ever-growing transcript. It should include, as applicable: - Task and
stable logical-operation IDs. - Goal and acceptance criteria. -
Repository identity and workspace revision/fingerprint. - Current plan
and plan version. - Completed and pending actions. - Authorized paths
and permissions. - Agent proposals and validation results. - Tool
executions and raw result references. - Build, test, lint, and security
evidence. - Mutation records and commit receipts. - Budget allocation
and consumption. - Approval and exception records. - Recovery status and
final decision.

Important claims should point to evidence identifying its source,
execution context, timestamp, and workspace version. Evidence from an
old workspace revision must not automatically validate a newer one.
Re-establish freshness or rerun affected checks.

## 9. Workspace Integrity and Security

The discussed repository direction includes file-mutation boundaries and
stronger release-gate exception handling. These are foundations, not
proof that all security properties are complete.

### 9.1 Mutation boundary

Before a write: 1. Normalize and validate the target path. 2. Confirm it
lies inside the authorized workspace. 3. Confirm the active plan permits
the mutation. 4. Confirm the workspace version is current. 5. Validate
the patch/change representation. 6. Record operation identity and
intent. 7. Apply the mutation through the controlled layer. 8. Record
the result and verify actual workspace state.

Account for traversal, symlinks, normalization differences, and race
conditions. Enforce authorization at the final mutation boundary, not
only in prompts or coordinator logic.

### 9.2 Release gates and exceptions

Required gates fail closed when evidence is missing or invalid. An
exception should require an authorized approver, canonical payload,
verifiable signature or equivalent authorization, binding to the
specific check/workspace revision/run, expiry, and an audit record. It
bypasses only its explicitly authorized scope, never unrelated failing
checks.

### 9.3 Risk tiers

-   **Low risk:** Narrow, reversible changes with deterministic
    verification.
-   **Medium risk:** Broad refactors, dependency changes, or changes
    with limited rollback confidence.
-   **High risk:** Authentication, authorization, cryptography, secrets,
    production infrastructure, destructive data operations, or release
    policy.

Higher-risk work requires stronger checks and may require human approval
before mutation, merge, deployment, or release. Risk rules must be
enforced by policy, not only self-assessed by an agent.

## 10. Durable Mutations and Crash Recovery

A crash may happen before a write, during a write, after a write but
before success is recorded, or after a commit but before its response
reaches the caller. These states are not equivalent.

Target lifecycle: 1. Create a durable operation record with a stable
logical-operation key. 2. Record intended targets, expected workspace
version, and validated change. 3. Apply the mutation through the
controlled layer. 4. Persist an authoritative receipt or enough state to
reconcile the result. 5. Verify the resulting workspace state. 6. Mark
completion only when recorded and observed state agree.

After a crash: - If the operation is proven not to have applied, retry
only if policy and budget allow. - If it is proven to have applied,
record the result and continue from reconciled state. - If ambiguous,
mark `RECOVERY_REQUIRED` and block conflicting mutations until
reconciled or escalated.

Never blindly replay a write because the previous process failed to
receive its response. Attempt IDs alone do not provide idempotency.
Operation identity, persistence, and uniqueness must be stable and
atomic where concurrency is possible.

## 11. Verification and Acceptance

Code generation and verification are separate responsibilities. A
plausible patch can still be wrong.

Use the applicable combination of: 1. Schema/output validation. 2.
Mutation-scope and authorization checks. 3. Formatting and static
analysis. 4. Type checking and compilation. 5. Targeted unit tests. 6.
Integration and end-to-end tests. 7. Security and dependency checks. 8.
Diff and scope review. 9. Final acceptance-criteria evaluation.

Required checks depend on task type and policy. A skipped check must be
reported as skipped.

A task is complete only when required criteria have evidence, mandatory
gates pass or a valid scoped exception applies, the final diff remains
authorized, evidence matches the accepted workspace version, and no
unresolved recovery state remains. If evidence is missing, report
partial completion and name the gap.

## 12. Human Oversight

Humans should not need to approve every keystroke, but AutoCoder must
know which actions it may take independently.

Request input or approval when requirements are materially ambiguous,
permissions are missing, scope expansion is needed, risk is high,
evidence conflicts, a release exception is requested, recovery is
ambiguous, or the budget/stagnation limit is reached. Approvals should
be explicit, scoped, auditable, and time-bounded where appropriate.

## 13. Observability and Evaluation

Evaluate outcomes, safety, efficiency, and recovery, not how autonomous
a demo appears.

**Task outcomes** - End-to-end success and acceptance-criteria
completion rates. - Regression rate. - Percentage of completions backed
by required evidence. - Human intervention rate.

**Efficiency** - Model calls, tokens, tool calls, latency, and cost per
successful task. - Repair attempts and verification cost.

**Reliability** - Recovery success rate. - Duplicate mutation rate. -
Stale-evidence acceptance rate. - Budget enforcement violations. -
Unauthorized mutation attempts blocked. - False-positive completion
rate.

**Adaptive quality** - Success versus a fixed-pipeline baseline. -
Repeated or low-value action frequency. - Ability to change strategy
after failure. - Quality of stop/escalate decisions.

Run the fixed pipeline and adaptive coordinator against the same
representative tasks with comparable permissions and acceptance
criteria. Compare success, regressions, calls/tokens, latency, cost,
recovery, unsafe-action blocking, and human intervention. Expand
autonomy only if measured benefits justify complexity and expense.

## 14. Roadmap

### Phase 1: Finish the deterministic control plane

-   Make the shared repair budget mandatory.
-   Enforce budget use for every model/tool call, retry, repair, and
    verification step.
-   Ensure parallel work cannot overspend a shared budget.
-   Integrate durable operation state and authoritative commit
    reconciliation with actual mutations.
-   Use stable logical-operation IDs and receipts.
-   Halt safely on authorization failure, stale state, or ambiguous
    mutation outcomes.
-   Preserve fail-closed release gates and scoped exceptions.

**Exit criteria:** Tests prove exhaustion blocks further work,
unauthorized writes are blocked at the mutation boundary, and recovery
does not blindly replay ambiguous operations.

### Phase 2: Formalize contracts and evidence

-   Define schemas for all agent roles and coordinator actions.
-   Replace brittle Markdown-derived mutation targets with structured,
    schema-validated repair plans.
-   Bind failures and repair actions to evidence and workspace
    fingerprints.
-   Define task states, valid transitions, freshness rules, and audit
    records.

**Exit criteria:** Invalid, stale, incomplete, and unauthorized outputs
are rejected deterministically.

### Phase 3: Add bounded adaptive action selection

-   Define a finite action space and policy per action.
-   Require structured proposals with rationale, preconditions,
    evidence, risk, and cost.
-   Enforce budget reservation and policy checks before execution.
-   Add stagnation detection and strategy switching.
-   Define explicit stop, escalate, and completion decisions.

**Exit criteria:** The coordinator adapts to different failure types and
can explain why it continued, changed strategy, stopped, or escalated.

### Phase 4: Adversarial and fault-injection testing

Test crashes before/during/after mutation, lost commit responses,
duplicate and concurrent attempts, nested budget exhaustion,
cancellation, stale fingerprints, traversal and symlink cases, malformed
outputs, repeated failures, and invalid/expired exceptions.

**Exit criteria:** Failures produce controlled stop, recovery, or
escalation states, never silent acceptance.

### Phase 5: Evaluate and roll out gradually

-   Compare in shadow mode against the fixed pipeline.
-   Begin with low-risk, reversible tasks.
-   Require approval for high-impact or ambiguous changes.
-   Track outcomes, regressions, budgets, latency, and recovery.
-   Expand autonomy only after predefined thresholds are met.
-   Preserve a kill switch and inspectable stopped operations.

### Phase 6: Expand software-building capability

Add full-project generation, multi-module features, dependency-aware
refactoring, test generation, defect repair, documentation/migrations,
and UI/integration testing as tooling allows. Reuse the same
authorization, evidence, budget, mutation, recovery, and acceptance
infrastructure for every new capability.

## 15. Current Foundations Versus Target Capabilities

Based on the repository discussion around commit
`9e7985091233ed55596b49723534d090cef20326`, the project has foundations
including: - A repair coordinator and Tester/Debugger/Coder flow. -
Structured repair-plan extraction and authorization checks. - File
mutation boundary work and associated tests. - Security-gate exception
validation and trusted-approver concepts. - Budget helper functions. -
Durable repair-attempt and commit-receipt helper concepts. -
Verification and workspace policy components.

These foundations do not prove the target system is complete. Gaps
identified in the discussed baseline included: - Budget was optional at
the coordinator boundary and was not visibly enforced around every
execution call. - Recovery helpers did not by themselves prove durable
authoritative state was integrated with the real mutation lifecycle. -
Markdown-derived repair-plan parsing could be brittle. - The coordinator
still used a largely fixed repair cycle rather than adaptive action
selection. - Tests and CI results require actual execution and
inspection; absence of returned status information does not prove checks
passed.

These are observations from the discussed baseline, not claims about
later commits. Re-audit the repository before using this section as a
current implementation-status report.

## 16. Non-Goals

AutoCoder is not intended to be: - An unrestricted process with
arbitrary shell, network, or filesystem access. - A model that decides
its own permissions. - A system that treats confidence or eloquence as
evidence. - A group of agents without contracts or shared state. - A
retry loop without a global budget or stopping condition. - A system
that hides failed checks to report success. - A tool that makes
high-impact production changes without authorization. - An architecture
that requires many agents or expensive calls for every task. - A system
that prioritizes autonomy over reliability, security, reproducibility,
or cost.

The objective is useful autonomy under control, not autonomy as a
performance.

## 17. Final Target-State Definition

AutoCoder qualifies as an agentic software builder when it repeatedly
demonstrates that it can:

1.  Take a high-level software goal and derive verifiable acceptance
    criteria.
2.  Inspect and reason about a real, versioned workspace.
3.  Select and revise a plan based on evidence.
4.  Use specialist agents and deterministic tools through validated
    contracts.
5.  Execute only authorized actions within a mandatory shared budget.
6.  Make bounded, traceable, recoverable changes.
7.  Verify outcomes independently of the agents that generated the
    changes.
8.  Detect stagnation, uncertainty, stale evidence, and unsafe
    conditions.
9.  Stop or request human input when policy, risk, or evidence requires
    it.
10. Produce an auditable report distinguishing verified success from
    partial or unverified work.

**The end state is not "AI writes code." It is "AI manages a bounded
engineering process and can prove what it did, what worked, what did
not, and why."**

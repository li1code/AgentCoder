import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  isControlPlaneArtifact,
  normalizeProjectPath,
  canonicalizeProjectPath,
  classifyWorkspaceFile,
} from '../../workspace-policy';
import { classifyArchitectureFile, requiresModuleOwnership } from '../../architecture-file-policy';
import {
  BudgetManager,
  BudgetExhaustionException,
  DEFAULT_BUDGET_LIMITS,
  bindRunBudgetAlias,
  getOrCreateRunBudget,
} from '../../budget-manager';
import {
  executeDurableMutation,
  generateOperationKey,
  computeSha256,
  getOperationRecord,
  setMutationFaultInjectorForTest,
  resetOperationRegistryForTest,
  RecoveryRequiredException,
} from '../../mutation-manager';
import {
  securityAuthorityService,
  SecurityGateException,
  SecurityGateResult,
} from '../../security-gate';
import {
  parseReviewerOutput,
  parseStructuredFindings,
  validateReviewerEvidenceGrounding,
} from '../schemas/reviewer';
import {
  PERMITTED_ACTIONS,
  validateActionProposal,
  StagnationDetector,
  BoundedAdaptiveCoordinator,
  ActionProposal,
} from '../../adaptive-coordinator';
import { writeVirtualFile, readVirtualFile } from '../../vfs';
import { prisma } from '../../../../db';

describe('AutoCoder Agentic Software Builder Vision Suite (Phases 1-4 & F-01–F-13)', () => {
  const testConvId = `vision-test-${Date.now()}`;
  const testRunId = `run-${Date.now()}`;

  before(async () => {
    await prisma.conversation.create({
      data: {
        id: testConvId,
        title: 'Vision Test Project',
        status: 'Active',
        currentStage: 'Coder',
      },
    });
    await prisma.pipelineRun.create({
      data: {
        id: testRunId,
        conversationId: testConvId,
        state: 'RUNNING',
      },
    });
  });

  after(async () => {
    await prisma.durableMutation.deleteMany({ where: { conversationId: testConvId } });
    await prisma.artifactVersion.deleteMany({ where: { conversationId: testConvId } });
    await prisma.virtualFile.deleteMany({ where: { conversationId: testConvId } });
    await prisma.pipelineRun.deleteMany({ where: { conversationId: testConvId } });
    await prisma.conversation.deleteMany({ where: { id: testConvId } });
  });

  beforeEach(async () => {
    await resetOperationRegistryForTest();
  });

  // ─── 1. Security Boundaries & Strict Canonical Paths (F-01, F-05, F-03) ───

  it('F-01: root control-plane artifacts are recognized, but nested files (e.g. src/features/plan.md) are project files', () => {
    assert.strictEqual(isControlPlaneArtifact('plan.md'), true);
    assert.strictEqual(isControlPlaneArtifact('./plan.md'), true);
    assert.strictEqual(isControlPlaneArtifact('architecture.md'), true);
    assert.strictEqual(isControlPlaneArtifact('workspace.manifest.json'), true);

    // Nested files with control-plane basenames MUST NOT be classified as control plane!
    assert.strictEqual(isControlPlaneArtifact('src/features/plan.md'), false);
    assert.strictEqual(isControlPlaneArtifact('app/docs/architecture.md'), false);
    assert.strictEqual(isControlPlaneArtifact('tests/test_report.md'), false);

    assert.strictEqual(classifyWorkspaceFile('plan.md'), 'pipeline-artifact');
    assert.strictEqual(classifyWorkspaceFile('src/features/plan.md'), 'project');
  });

  it('F-05: canonicalizeProjectPath strictly sanitizes paths and rejects traversal, drive letters, and empty roots', () => {
    assert.strictEqual(canonicalizeProjectPath('./src/index.ts'), 'src/index.ts');
    assert.strictEqual(canonicalizeProjectPath('.\\src\\utils.ts'), 'src/utils.ts');
    assert.strictEqual(canonicalizeProjectPath('src///components//Button.tsx'), 'src/components/Button.tsx');

    // Traversal attacks must be rejected
    assert.throws(
      () => canonicalizeProjectPath('../secret.txt'),
      /Security Exception: Unsafe file path traversal detected/
    );
    assert.throws(
      () => canonicalizeProjectPath('src/../../etc/passwd'),
      /Security Exception: Unsafe file path traversal detected/
    );
    assert.throws(
      () => canonicalizeProjectPath('/absolute/path/file.ts'),
      /Security Exception: Unsafe file path traversal detected/
    );
    assert.throws(
      () => canonicalizeProjectPath('C:\\Windows\\System32'),
      /Security Exception: Unsafe file path traversal detected/
    );
  });

  it('F-03: framework-aware classification distinguishes Next App Router files from normal components', () => {
    // App Router framework files
    assert.strictEqual(classifyArchitectureFile('src/app/page.tsx'), 'framework');
    assert.strictEqual(classifyArchitectureFile('src/app/api/route.ts'), 'framework');
    assert.strictEqual(classifyArchitectureFile('app/layout.tsx'), 'framework');

    // Generic component in src/components/layout.tsx is an implementation component, NOT framework route
    assert.strictEqual(classifyArchitectureFile('src/components/layout.tsx'), 'implementation');

    // Both still require module ownership in architecture
    assert.strictEqual(requiresModuleOwnership('src/app/page.tsx'), true);
    assert.strictEqual(requiresModuleOwnership('src/components/layout.tsx'), true);

    // Static assets & configs do not require module ownership
    assert.strictEqual(requiresModuleOwnership('public/favicon.ico'), false);
    assert.strictEqual(requiresModuleOwnership('package.json'), false);
  });

  // ─── 2. Mandatory Shared Budget Enforcement (Vision Sec. 4.4, F-08) ────────

  it('Phase 1: BudgetManager enforces model call limits, tool limits, and throws BudgetExhaustionException', async () => {
    const budget = new BudgetManager({
      maxModelCalls: 2,
      maxToolCalls: 2,
    });

    const res1 = await budget.reserveModelCall(100);
    res1.commit(100);

    const res2 = await budget.reserveModelCall(150);
    res2.commit(150);

    // 3rd model call must exceed limit and throw
    await assert.rejects(
      async () => {
        await budget.reserveModelCall(50);
      },
      (err: any) => {
        assert.ok(err instanceof BudgetExhaustionException);
        assert.ok(err.reasons.some((r: string) => r.includes('Model call limit reached')));
        return true;
      }
    );
  });

  it('Phase 1: BudgetManager prevents concurrent overspending through thread-safe reservation', async () => {
    const budget = new BudgetManager({
      maxToolCalls: 3,
    });

    const reservations = await Promise.all([
      budget.reserveToolCall('npm_install'),
      budget.reserveToolCall('npm_install'),
      budget.reserveToolCall('npm_install'),
    ]);

    assert.strictEqual(reservations.length, 3);
    reservations.forEach((r) => r.commit());

    // 4th concurrent tool reservation must fail
    await assert.rejects(
      async () => {
        await budget.reserveToolCall('npm_install');
      },
      /BudgetExhaustionException/
    );
  });

  it('Phase 1: model token reservations and run aliases share one hard budget', async () => {
    const budget = new BudgetManager({ maxTotalTokens: 100 });
    const first = await budget.reserveModelCall(80);
    await assert.rejects(() => budget.reserveModelCall(21), /BudgetExhaustionException/);
    first.release();

    const aliasId = `budget-alias-${Date.now()}`;
    const runId = `budget-run-${Date.now()}`;
    const byAlias = getOrCreateRunBudget(aliasId);
    const canonical = bindRunBudgetAlias(runId, aliasId);
    assert.strictEqual(byAlias, canonical);
    assert.strictEqual(getOrCreateRunBudget(runId), getOrCreateRunBudget(aliasId));
  });

  // ─── 3. Durable Mutations, Receipts & Crash Reconciliation (Vision Sec. 10) ───

  it('Phase 1 & Sec. 10: executeDurableMutation generates receipts and prevents duplicate patch reapplication', async () => {
    // Write an initial file into VFS
    await writeVirtualFile(testConvId, 'src/math.ts', 'export function add(a: number, b: number) { return a + b; }\n');

    // Set up mock blueprint in DB for authorization
    await prisma.artifactVersion.create({
      data: {
        conversationId: testConvId,
        pipelineRunId: testRunId,
        stageName: 'Blueprinter',
        filePath: 'blueprint.md',
        version: 1,
        contentHash: 'mock-hash',
        content: `### File: src/math.ts\n- Module: MathModule\n- Description: Math helpers\n- Dependencies: None`,
        state: 'ACCEPTED',
      },
    });

    const receipt1 = await executeDurableMutation({
      conversationId: testConvId,
      pipelineRunId: testRunId,
      opType: 'FILE_WRITE',
      targetPath: 'src/math.ts',
      content: 'export function add(a: number, b: number) { return a + b + 0; }\n',
    });

    assert.ok(receipt1.operationKey.startsWith('op_'));
    assert.strictEqual(receipt1.targetPath, 'src/math.ts');

    // Executing the identical mutation again must return the existing receipt without re-applying (Idempotent!)
    const duplicateReceipts = await Promise.all([1, 2].map(() => executeDurableMutation({
      conversationId: testConvId,
      pipelineRunId: testRunId,
      opType: 'FILE_WRITE',
      targetPath: 'src/math.ts',
      content: 'export function add(a: number, b: number) { return a + b + 0; }\n',
    })));
    const receipt2 = duplicateReceipts[0];

    assert.strictEqual(receipt1.operationKey, receipt2.operationKey);
    assert.strictEqual(duplicateReceipts[1].operationKey, receipt2.operationKey);
    assert.strictEqual(receipt1.committedAt, receipt2.committedAt);

    const persisted = await getOperationRecord(receipt1.operationKey);
    assert.strictEqual(persisted?.state, 'COMMITTED');
    assert.strictEqual(persisted?.receipt?.operationKey, receipt1.operationKey);

    // Inject a crash after the VFS write but before the receipt update. A fresh
    // invocation must reconcile the persisted APPLYING record without replay.
    const recoveredContent = 'export function add(a: number, b: number) { return a + b + 1; }\n';
    setMutationFaultInjectorForTest((phase) => {
      if (phase === 'APPLIED') throw new Error('injected process interruption after VFS write');
    });
    await assert.rejects(() => executeDurableMutation({
      conversationId: testConvId,
      pipelineRunId: testRunId,
      opType: 'FILE_WRITE',
      targetPath: 'src/math.ts',
      content: recoveredContent,
    }), (error: any) => error instanceof RecoveryRequiredException);
    setMutationFaultInjectorForTest(null);
    const faultedRecord = await getOperationRecord(generateOperationKey({
      conversationId: testConvId,
      pipelineRunId: testRunId,
      opType: 'FILE_WRITE',
      targetPath: 'src/math.ts',
      contentOrDiff: recoveredContent,
    }));
    assert.strictEqual(faultedRecord?.state, 'APPLYING');
    const recovered = await executeDurableMutation({
      conversationId: testConvId,
      pipelineRunId: testRunId,
      opType: 'FILE_WRITE',
      targetPath: 'src/math.ts',
      content: recoveredContent,
    });
    assert.strictEqual(recovered.resultingContentHash, computeSha256(recoveredContent));
    assert.strictEqual((await getOperationRecord(recovered.operationKey))?.state, 'COMMITTED');

    // Retrying an older committed operation after a later write must fail closed
    // instead of restoring stale content over the newer workspace state.
    await assert.rejects(() => executeDurableMutation({
      conversationId: testConvId,
      pipelineRunId: testRunId,
      opType: 'FILE_WRITE',
      targetPath: 'src/math.ts',
      content: 'export function add(a: number, b: number) { return a + b + 0; }\n',
    }), (error: any) => error instanceof RecoveryRequiredException);

    const patchedContent = 'export function add(a: number, b: number) { return a + b + 2; }';
    setMutationFaultInjectorForTest((phase) => {
      if (phase === 'APPLIED') throw new Error('injected interruption after diff patch');
    });
    await assert.rejects(() => executeDurableMutation({
      conversationId: testConvId,
      pipelineRunId: testRunId,
      opType: 'DIFF_PATCH',
      targetPath: 'src/math.ts',
      content: patchedContent,
      diffRange: { startLine: 1, endLine: 1 },
    }), (error: any) => error instanceof RecoveryRequiredException);
    setMutationFaultInjectorForTest(null);
    const recoveredDiff = await executeDurableMutation({
      conversationId: testConvId,
      pipelineRunId: testRunId,
      opType: 'DIFF_PATCH',
      targetPath: 'src/math.ts',
      content: patchedContent,
      diffRange: { startLine: 1, endLine: 1 },
    });
    assert.strictEqual(recoveredDiff.resultingContentHash, computeSha256(`${patchedContent}\n`));
    assert.strictEqual(await readVirtualFile(testConvId, 'src/math.ts'), `${patchedContent}\n`);
  });

  // ─── 4. Production Authority & Release Exceptions (F-09, Vision Sec. 9.2) ──

  it('F-09: SecurityAuthorityService verifies cryptographic signature and rejects forged/stale exceptions', () => {
    const adminSecret = 'production-authority-secret-key-32chars!!';
    const untrustedPayload = {
      id: 'EX-untrusted',
      conversationId: 'conv-123',
      pipelineRunId: 'run-123',
      workspaceHash: 'a'.repeat(64),
      approverId: 'system-security-admin',
      ruleId: 'HARDCODED_SECRET',
      targetFile: 'src/config.ts',
      reason: 'Test authority is not preconfigured',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    const untrusted = {
      ...untrustedPayload,
      signature: securityAuthorityService.createSignature(untrustedPayload, adminSecret),
    };
    assert.strictEqual(securityAuthorityService.validateException(untrusted, untrustedPayload.workspaceHash).valid, false);

    securityAuthorityService.registerApprover({
      id: 'system-security-admin',
      secret: adminSecret,
      permissions: ['*'],
    });
    const workspaceHash = 'a'.repeat(64);

    const validPayload = {
      id: 'EX-001',
      conversationId: 'conv-123',
      pipelineRunId: 'run-123',
      workspaceHash,
      approverId: 'system-security-admin',
      ruleId: 'HARDCODED_SECRET',
      targetFile: 'src/config.ts',
      reason: 'Known test fixture secret excused by secops',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };

    const validSignature = securityAuthorityService.createSignature(validPayload, adminSecret);
    const validException: SecurityGateException = {
      ...validPayload,
      signature: validSignature,
    };

    const checkValid = securityAuthorityService.validateException(validException, workspaceHash);
    assert.strictEqual(checkValid.valid, true);

    const changedReason = { ...validException, reason: 'Changed after signing' };
    assert.strictEqual(securityAuthorityService.validateException(changedReason, workspaceHash).valid, false);

    // Forged signature must fail
    const forgedException: SecurityGateException = {
      ...validException,
      signature: 'bad-signature-000000000000000000000000000000000000000000000000',
    };
    const checkForged = securityAuthorityService.validateException(forgedException, workspaceHash);
    assert.strictEqual(checkForged.valid, false);
    assert.ok(checkForged.error?.includes('signature mismatch'));

    // Stale workspace hash must fail
    const checkStale = securityAuthorityService.validateException(validException, 'b'.repeat(64));
    assert.strictEqual(checkStale.valid, false);
    assert.ok(checkStale.error?.includes('workspace hash mismatch'));

    // Expired exception must fail
    const expiredException: SecurityGateException = {
      ...validPayload,
      expiresAt: new Date(Date.now() - 10_000).toISOString(),
      signature: '',
    };
    expiredException.signature = securityAuthorityService.createSignature(expiredException, adminSecret);
    const checkExpired = securityAuthorityService.validateException(expiredException, workspaceHash);
    assert.strictEqual(checkExpired.valid, false);
    assert.ok(checkExpired.error?.includes('expired'));
  });

  // ─── 5. Evidence-Grounded Reviewer Findings (F-10) ──────────────────────────

  it('F-10: parseStructuredFindings and validateReviewerEvidenceGrounding catch non-existent files and contradictions', () => {
    const reportText = `# Review Report

### Overall Assessment
Code quality is acceptable with one minor defect.

### Quality Score
88

### Architectural Conformance
PASS

### Requirement Coverage
PASS

### Findings
- [FINDING-001] [BLOCKING] Missing error boundary in component [file: src/nonexistent.tsx]
- [FINDING-002] [WARNING] Redundant state hook [file: src/app.tsx]

### Workspace Hash
${'c'.repeat(64)}
`;

    const parsed = parseReviewerOutput(reportText);
    assert.ok(parsed.output);
    assert.strictEqual(parsed.output?.structuredFindings?.length, 2);

    const validation = validateReviewerEvidenceGrounding(
      parsed.output!,
      ['src/app.tsx'], // src/nonexistent.tsx does not exist!
      'c'.repeat(64)
    );

    assert.strictEqual(validation.valid, false);
    assert.ok(
      validation.errors.some((e) => e.includes('src/nonexistent.tsx') && e.includes('references non-existent project file'))
    );
  });

  // ─── 6. Bounded Adaptive Action Selection & Coordinator (Vision Sec. 5, 7) ─

  it('Phase 3: validateActionProposal restricts actions to finite space, enforces authorization, and gates high risk', () => {
    const budget = new BudgetManager();
    const authorizedFiles = ['src/index.ts', 'src/utils.ts'];

    // 1. Valid proposal
    const validProposal: ActionProposal = {
      action: 'implement_change',
      objective: 'Implement utility helper function',
      rationale: 'Required by feature specification F-01',
      targetFiles: ['src/utils.ts'],
      riskTier: 'low',
      requiresApproval: false,
      successConditions: ['TypeScript compiles cleanly'],
    };
    const resValid = validateActionProposal(validProposal, { authorizedFiles, budget });
    assert.strictEqual(resValid.valid, true);

    // 2. Unauthorized action type
    const invalidActionProposal: ActionProposal = {
      ...validProposal,
      action: 'arbitrary_shell_exec' as any,
    };
    const resAction = validateActionProposal(invalidActionProposal, { authorizedFiles, budget });
    assert.strictEqual(resAction.valid, false);
    assert.ok(resAction.errors.some((e) => e.includes('permitted finite action space')));

    // 3. Unauthorized target path
    const unauthorizedPathProposal: ActionProposal = {
      ...validProposal,
      targetFiles: ['src/unapproved_backdoor.ts'],
    };
    const resPath = validateActionProposal(unauthorizedPathProposal, { authorizedFiles, budget });
    assert.strictEqual(resPath.valid, false);
    assert.ok(resPath.errors.some((e) => e.includes('not in the approved workspace file set')));

    // 4. High risk without approval
    const highRiskProposal: ActionProposal = {
      ...validProposal,
      riskTier: 'high',
      requiresApproval: true,
    };
    const resRisk = validateActionProposal(highRiskProposal, {
      authorizedFiles,
      budget,
      riskApprovalGranted: false,
    });
    assert.strictEqual(resRisk.valid, false);
    assert.ok(resRisk.errors.some((e) => e.includes('High-risk action requires explicit human approval')));
  });

  it('Phase 3: StagnationDetector detects identical consecutive failures and recommends strategy switch / escalation', () => {
    const detector = new StagnationDetector(2);

    // First failure
    const r1 = detector.recordOutcome({
      action: 'repair_failure',
      objective: 'Fix broken import',
      success: false,
      failureSignature: 'ERR_MODULE_NOT_FOUND:lodash',
      timestamp: Date.now(),
    });
    assert.strictEqual(r1.isStagnated, false);
    assert.strictEqual(r1.recommendation, 'CONTINUE');

    // Second consecutive failure with same error signature -> Stagnation!
    const r2 = detector.recordOutcome({
      action: 'repair_failure',
      objective: 'Retry fixing broken import',
      success: false,
      failureSignature: 'ERR_MODULE_NOT_FOUND:lodash',
      timestamp: Date.now(),
    });
    assert.strictEqual(r2.isStagnated, true);
    assert.strictEqual(r2.recommendation, 'SWITCH_STRATEGY');
    assert.ok(r2.reason?.includes('Repeated failure detected'));

    // Third consecutive failure -> Escalate to human
    const r3 = detector.recordOutcome({
      action: 'repair_failure',
      objective: 'Third attempt',
      success: false,
      failureSignature: 'ERR_MODULE_NOT_FOUND:lodash',
      timestamp: Date.now(),
    });
    assert.strictEqual(r3.isStagnated, true);
    assert.strictEqual(r3.recommendation, 'ESCALATE');
  });

  it('Phase 3: BoundedAdaptiveCoordinator executes an action cycle and collects evidence', async () => {
    const coordinator = new BoundedAdaptiveCoordinator({
      conversationId: testConvId,
      pipelineRunId: testRunId,
      authorizedFiles: ['src/math.ts'],
    });

    const proposal: ActionProposal = {
      action: 'inspect_workspace',
      objective: 'Inspect project structure and linter health',
      rationale: 'Initial intake baseline before change',
      riskTier: 'low',
      requiresApproval: false,
      successConditions: ['Inspection diagnostics collected'],
    };

    const cycleResult = await coordinator.executeCycle(proposal, async () => {
      return { success: true };
    });

    assert.strictEqual(cycleResult.validation.valid, true);
    assert.strictEqual(cycleResult.outcome?.isStagnated, false);
    assert.strictEqual(cycleResult.outcome?.recommendation, 'CONTINUE');
  });

  it('Phase 3: adaptive actions without a registered handler cannot report success', async () => {
    const coordinator = new BoundedAdaptiveCoordinator({
      conversationId: testConvId,
      pipelineRunId: testRunId,
      authorizedFiles: ['src/math.ts'],
    });
    const proposal: ActionProposal = {
      action: 'inspect_workspace',
      objective: 'Inspect project structure and linter health',
      rationale: 'Initial intake baseline before change',
      riskTier: 'low',
      requiresApproval: false,
      successConditions: ['Inspection diagnostics collected'],
    };

    const result = await coordinator.executeCycle(proposal);
    assert.strictEqual(result.validation.valid, true);
    assert.strictEqual(result.outcome?.isStagnated, false);
    assert.strictEqual(result.outcome?.recommendation, 'CONTINUE');
  });

  it('Phase 3: an explicit approval requirement blocks medium-risk actions without approval', () => {
    const proposal: ActionProposal = {
      action: 'design_change',
      objective: 'Change the service boundary',
      rationale: 'The current service boundary causes coupling',
      riskTier: 'medium',
      requiresApproval: true,
      successConditions: ['The approved boundary is implemented'],
    };
    const result = validateActionProposal(proposal, {
      authorizedFiles: ['src/index.ts'],
      budget: new BudgetManager(),
    });
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes('requires explicit human approval')));
  });
});

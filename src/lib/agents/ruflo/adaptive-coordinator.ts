/**
 * AutoCoder Bounded Adaptive Coordinator
 * Implements Section 3, 5, 7, and Phase 3 of AutoCoder Agentic Software Builder Vision.
 * Provides:
 * - Finite permitted action space
 * - Structured action proposals with risk tiers and cost estimates
 * - Deterministic policy and budget gating
 * - Observable progress measurement and stagnation detection
 * - Strategy switching and safe stopping rules
 */

import { BudgetManager, BudgetSnapshot, getOrCreateRunBudget } from './budget-manager';
import { canonicalizeProjectPath } from './workspace-policy';
import { computeWorkspaceFingerprint, runFullWorkspaceTester } from './verification-loop';

export const PERMITTED_ACTIONS = [
  'inspect_workspace',
  'clarify_requirement',
  'analyze_failure',
  'design_change',
  'implement_change',
  'run_targeted_test',
  'run_full_verification',
  'review_diff',
  'repair_failure',
  'reconcile_operation',
  'request_approval',
  'complete',
  'stop',
] as const;

export type PermittedAction = (typeof PERMITTED_ACTIONS)[number];
export type RiskTier = 'low' | 'medium' | 'high';

export interface ActionProposal {
  action: PermittedAction;
  objective: string;
  rationale: string;
  evidenceIds?: string[];
  targetFiles?: string[];
  costEstimate?: {
    estimatedTokens?: number;
    toolCalls?: number;
  };
  riskTier: RiskTier;
  requiresApproval: boolean;
  successConditions: string[];
}

export interface ProposalValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ProposalValidationContext {
  authorizedFiles: string[];
  budget: BudgetManager;
  riskApprovalGranted?: boolean;
}

export function validateActionProposal(
  proposal: ActionProposal,
  context: ProposalValidationContext
): ProposalValidationResult {
  const errors: string[] = [];

  // 1. Permitted Action Check
  if (!PERMITTED_ACTIONS.includes(proposal.action)) {
    errors.push(`Policy Error: Action "${proposal.action}" is not in the permitted finite action space.`);
    return { valid: false, errors };
  }

  if (!['low', 'medium', 'high'].includes(proposal.riskTier)) {
    errors.push(`Policy Error: Unknown risk tier "${proposal.riskTier}" is not permitted.`);
  }
  if (typeof proposal.requiresApproval !== 'boolean') {
    errors.push('Policy Error: requiresApproval must be an explicit boolean.');
  }

  // 2. Objective and Rationale Non-Empty
  if (!proposal.objective || proposal.objective.trim().length < 5) {
    errors.push('Policy Error: Action proposal objective must be clear and non-empty.');
  }
  if (!proposal.rationale || proposal.rationale.trim().length < 5) {
    errors.push('Policy Error: Action proposal rationale must cite motivating evidence.');
  }

  // 3. Target Paths Authorization
  const modifiesFiles = proposal.action === 'implement_change' || proposal.action === 'repair_failure';
  if (modifiesFiles && (!proposal.targetFiles || proposal.targetFiles.length === 0)) {
    errors.push('Authorization Error: File mutation actions must name at least one authorized target file.');
  }
  if (proposal.targetFiles && proposal.targetFiles.length > 0) {
    const authorizedSet = new Set(
      context.authorizedFiles.map((f) => f.replace(/\\/g, '/').toLowerCase())
    );
    for (const tf of proposal.targetFiles) {
      try {
        const norm = canonicalizeProjectPath(tf).toLowerCase();
        if (
          modifiesFiles
        ) {
          if (!authorizedSet.has(norm)) {
            errors.push(`Authorization Error: Target file "${tf}" is not in the approved workspace file set.`);
          }
        }
      } catch (err: any) {
        errors.push(`Path Error: Target file "${tf}" is unsafe: ${err.message}`);
      }
    }
  }

  // 4. Risk Gate
  if (proposal.requiresApproval && proposal.riskTier !== 'high' && !context.riskApprovalGranted) {
    errors.push('Approval Gate Error: This action requires explicit human approval before execution.');
  }
  if (proposal.riskTier === 'high' && !context.riskApprovalGranted) {
    errors.push('Risk Gate Error: High-risk action requires explicit human approval before execution.');
  }

  // 5. Budget Gate
  const budgetSnapshot = context.budget.getSnapshot();
  if (budgetSnapshot.exhausted) {
    errors.push(`Budget Gate Error: Budget exhausted: ${budgetSnapshot.exhaustionReasons.join('; ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export interface ActionOutcomeRecord {
  action: PermittedAction;
  objective: string;
  success: boolean;
  failureSignature?: string;
  resolvedFailure?: string;
  timestamp: number;
}

export class StagnationDetector {
  private history: ActionOutcomeRecord[] = [];
  private consecutiveIdenticalFailures = 0;
  private lastFailureSignature: string | null = null;
  private readonly stagnationThreshold: number;

  constructor(stagnationThreshold: number = 2) {
    this.stagnationThreshold = stagnationThreshold;
  }

  public recordOutcome(outcome: ActionOutcomeRecord): {
    isStagnated: boolean;
    recommendation: 'CONTINUE' | 'SWITCH_STRATEGY' | 'ESCALATE' | 'STOP';
    reason?: string;
  } {
    this.history.push(outcome);

    if (outcome.success) {
      this.consecutiveIdenticalFailures = 0;
      this.lastFailureSignature = null;
      return { isStagnated: false, recommendation: 'CONTINUE' };
    }

    if (outcome.failureSignature) {
      if (outcome.failureSignature === this.lastFailureSignature) {
        this.consecutiveIdenticalFailures += 1;
      } else {
        this.consecutiveIdenticalFailures = 1;
        this.lastFailureSignature = outcome.failureSignature;
      }

      if (this.consecutiveIdenticalFailures >= this.stagnationThreshold) {
        return {
          isStagnated: true,
          recommendation: this.consecutiveIdenticalFailures >= 3 ? 'ESCALATE' : 'SWITCH_STRATEGY',
          reason: `Repeated failure detected: same error signature occurred ${this.consecutiveIdenticalFailures} times consecutively (${outcome.failureSignature}).`,
        };
      }
    }

    return { isStagnated: false, recommendation: 'CONTINUE' };
  }

  public getHistory(): ActionOutcomeRecord[] {
    return [...this.history];
  }
}

export interface CoordinatorRunResult {
  status: 'COMPLETED' | 'HALTED' | 'ESCALATED';
  actionsExecuted: number;
  finalWorkspaceHash: string;
  summary: string;
  stagnated: boolean;
  history: ActionOutcomeRecord[];
  budgetSnapshot: BudgetSnapshot;
}

export class BoundedAdaptiveCoordinator {
  private readonly conversationId: string;
  private readonly pipelineRunId: string;
  private readonly authorizedFiles: string[];
  private readonly budget: BudgetManager;
  private readonly stagnationDetector: StagnationDetector;

  constructor(params: {
    conversationId: string;
    pipelineRunId: string;
    authorizedFiles: string[];
    budget?: BudgetManager;
    stagnationThreshold?: number;
  }) {
    this.conversationId = params.conversationId;
    this.pipelineRunId = params.pipelineRunId;
    this.authorizedFiles = params.authorizedFiles;
    this.budget = params.budget || getOrCreateRunBudget(params.pipelineRunId || params.conversationId);
    this.stagnationDetector = new StagnationDetector(params.stagnationThreshold || 2);
  }

  /**
   * Deterministically evaluates next appropriate action based on current workspace evidence
   */
  public async selectNextAction(): Promise<ActionProposal> {
    this.budget.assertWithinBudget('selectNextAction');

    // Run verification to gather current evidence
    this.budget.recordVerificationRun();
    const verifyResult = await runFullWorkspaceTester(this.conversationId, 1);

    if (verifyResult.success) {
      return {
        action: 'complete',
        objective: 'Conclude engineering workflow: all automated checks pass cleanly.',
        rationale: 'Clean verification run without linter, import, or structural errors.',
        riskTier: 'low',
        requiresApproval: false,
        successConditions: ['Final gate verification passes'],
      };
    }

    const firstFailure = verifyResult.failures[0];
    return {
      action: 'repair_failure',
      objective: `Repair defect in ${firstFailure.file}: ${firstFailure.message.slice(0, 80)}`,
      rationale: `Automated tester found ${verifyResult.failures.length} failure(s) in workspace.`,
      targetFiles: firstFailure.file.includes('.') ? [firstFailure.file] : this.authorizedFiles.slice(0, 1),
      riskTier: 'low',
      requiresApproval: false,
      costEstimate: { estimatedTokens: 4096, toolCalls: 2 },
      successConditions: [`Error ${firstFailure.message.slice(0, 40)} resolved in next cycle`],
    };
  }

  /**
   * Executes a single bounded adaptive cycle with deterministic policy gating
   */
  public async executeCycle(
    customProposal?: ActionProposal,
    actionHandler?: (proposal: ActionProposal) => Promise<{ success: boolean; failureSignature?: string }>
  ): Promise<{
    proposal: ActionProposal;
    validation: ProposalValidationResult;
    outcome?: { isStagnated: boolean; recommendation: string; reason?: string };
  }> {
    const proposal = customProposal || (await this.selectNextAction());

    const validation = validateActionProposal(proposal, {
      authorizedFiles: this.authorizedFiles,
      budget: this.budget,
    });

    if (!validation.valid) {
      return { proposal, validation };
    }

    // An action without an executor is not an executed action. Treat it as a
    // failed outcome so callers cannot report success based only on a proposal.
    let success = false;
    let failureSignature: string | undefined;

    if (actionHandler) {
      const execResult = await actionHandler(proposal);
      success = execResult.success;
      failureSignature = execResult.failureSignature;
    } else {
      failureSignature = `NO_ACTION_HANDLER:${proposal.action}`;
    }

    const outcome = this.stagnationDetector.recordOutcome({
      action: proposal.action,
      objective: proposal.objective,
      success,
      failureSignature,
      timestamp: Date.now(),
    });

    return { proposal, validation, outcome };
  }

  public getBudgetSnapshot(): BudgetSnapshot {
    return this.budget.getSnapshot();
  }
}

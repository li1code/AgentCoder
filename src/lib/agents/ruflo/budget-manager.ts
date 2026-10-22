/**
 * AutoCoder Mandatory Shared Budget Manager
 * Implements Section 4.4 and Phase 1 of AutoCoder Agentic Software Builder Vision.
 * Enforces concurrency-safe global and stage budgets for:
 * - Wall-clock duration
 * - Model calls and token limits
 * - Tool invocations
 * - Repair attempts
 * - Verification runs
 */

export interface BudgetLimits {
  maxWallClockMs: number;
  maxModelCalls: number;
  maxTotalTokens: number;
  maxToolCalls: number;
  maxRepairAttempts: number;
  maxVerificationRuns: number;
  perToolCallLimits?: Record<string, number>;
}

export interface BudgetSnapshot {
  limits: BudgetLimits;
  consumed: {
    elapsedMs: number;
    modelCalls: number;
    totalTokens: number;
    toolCalls: number;
    repairAttempts: number;
    verificationRuns: number;
    perToolCalls: Record<string, number>;
  };
  exhausted: boolean;
  exhaustionReasons: string[];
}

export class BudgetExhaustionException extends Error {
  public readonly reasons: string[];
  public readonly snapshot: BudgetSnapshot;

  constructor(reasons: string[], snapshot: BudgetSnapshot) {
    super(`Budget Exhaustion Exception: Work halted safely. Reasons: ${reasons.join('; ')}`);
    this.name = 'BudgetExhaustionException';
    this.reasons = reasons;
    this.snapshot = snapshot;
  }
}

export const DEFAULT_BUDGET_LIMITS: BudgetLimits = {
  maxWallClockMs: 1_800_000, // 30 minutes
  maxModelCalls: 60,
  maxTotalTokens: 600_000,
  maxToolCalls: 120,
  maxRepairAttempts: 5,
  maxVerificationRuns: 10,
  perToolCallLimits: {
    npm_install: 10,
    run_build: 15,
  },
};

export class BudgetManager {
  private readonly limits: BudgetLimits;
  private readonly startTime: number;
  private modelCalls: number = 0;
  private totalTokens: number = 0;
  private toolCalls: number = 0;
  private repairAttempts: number = 0;
  private verificationRuns: number = 0;
  private perToolCalls: Map<string, number> = new Map();

  // Active concurrency reservations
  private reservedModelCalls: number = 0;
  private reservedToolCalls: number = 0;
  private lockPromise: Promise<void> = Promise.resolve();

  constructor(limits: Partial<BudgetLimits> = {}) {
    this.limits = {
      ...DEFAULT_BUDGET_LIMITS,
      ...limits,
      perToolCallLimits: {
        ...DEFAULT_BUDGET_LIMITS.perToolCallLimits,
        ...(limits.perToolCallLimits || {}),
      },
    };
    this.startTime = Date.now();
  }

  private async withLock<T>(fn: () => T | Promise<T>): Promise<T> {
    let releaseLock!: () => void;
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    const currentLock = this.lockPromise;
    this.lockPromise = this.lockPromise.then(() => nextLock);
    await currentLock;
    try {
      return await fn();
    } finally {
      releaseLock();
    }
  }

  public getSnapshot(): BudgetSnapshot {
    const elapsedMs = Date.now() - this.startTime;
    const perToolRecord: Record<string, number> = {};
    for (const [tool, count] of this.perToolCalls.entries()) {
      perToolRecord[tool] = count;
    }

    const reasons: string[] = [];
    if (elapsedMs > this.limits.maxWallClockMs) {
      reasons.push(`Wall-clock deadline exceeded (${elapsedMs}ms > ${this.limits.maxWallClockMs}ms)`);
    }
    if (this.modelCalls + this.reservedModelCalls > this.limits.maxModelCalls) {
      reasons.push(`Model invocation limit exceeded (${this.modelCalls} calls > ${this.limits.maxModelCalls})`);
    }
    if (this.totalTokens > this.limits.maxTotalTokens) {
      reasons.push(`Token limit exceeded (${this.totalTokens} tokens > ${this.limits.maxTotalTokens})`);
    }
    if (this.toolCalls + this.reservedToolCalls > this.limits.maxToolCalls) {
      reasons.push(`Tool invocation limit exceeded (${this.toolCalls} calls > ${this.limits.maxToolCalls})`);
    }
    if (this.repairAttempts > this.limits.maxRepairAttempts) {
      reasons.push(`Repair attempt limit exceeded (${this.repairAttempts} attempts > ${this.limits.maxRepairAttempts})`);
    }
    if (this.verificationRuns > this.limits.maxVerificationRuns) {
      reasons.push(`Verification run limit exceeded (${this.verificationRuns} runs > ${this.limits.maxVerificationRuns})`);
    }

    return {
      limits: { ...this.limits },
      consumed: {
        elapsedMs,
        modelCalls: this.modelCalls,
        totalTokens: this.totalTokens,
        toolCalls: this.toolCalls,
        repairAttempts: this.repairAttempts,
        verificationRuns: this.verificationRuns,
        perToolCalls: perToolRecord,
      },
      exhausted: reasons.length > 0,
      exhaustionReasons: reasons,
    };
  }

  public assertWithinBudget(actionName: string = 'Operation'): void {
    const snapshot = this.getSnapshot();
    if (snapshot.exhausted) {
      throw new BudgetExhaustionException(snapshot.exhaustionReasons, snapshot);
    }
  }

  /**
   * Concurrency-safe reservation for a model invocation.
   * Ensures parallel steps cannot jointly overspend the shared budget.
   */
  public async reserveModelCall(estimatedTokens: number = 0): Promise<{
    commit: (actualTokensUsed?: number) => void;
    release: () => void;
  }> {
    return this.withLock(() => {
      this.assertWithinBudget('reserveModelCall');
      if (this.modelCalls + this.reservedModelCalls + 1 > this.limits.maxModelCalls) {
        throw new BudgetExhaustionException(
          [`Model call limit reached (${this.modelCalls + this.reservedModelCalls + 1} > ${this.limits.maxModelCalls})`],
          this.getSnapshot()
        );
      }
      this.reservedModelCalls += 1;
      let committed = false;
      let released = false;

      return {
        commit: (actualTokensUsed: number = estimatedTokens) => {
          if (committed || released) return;
          committed = true;
          this.reservedModelCalls = Math.max(0, this.reservedModelCalls - 1);
          this.modelCalls += 1;
          this.totalTokens += Math.max(0, actualTokensUsed);
        },
        release: () => {
          if (committed || released) return;
          released = true;
          this.reservedModelCalls = Math.max(0, this.reservedModelCalls - 1);
        },
      };
    });
  }

  /**
   * Concurrency-safe reservation for a tool execution.
   */
  public async reserveToolCall(toolName: string): Promise<{
    commit: () => void;
    release: () => void;
  }> {
    return this.withLock(() => {
      this.assertWithinBudget(`reserveToolCall:${toolName}`);
      if (this.toolCalls + this.reservedToolCalls + 1 > this.limits.maxToolCalls) {
        throw new BudgetExhaustionException(
          [`Tool call limit reached (${this.toolCalls + this.reservedToolCalls + 1} > ${this.limits.maxToolCalls})`],
          this.getSnapshot()
        );
      }
      const toolLimit = this.limits.perToolCallLimits?.[toolName];
      const currentToolCount = this.perToolCalls.get(toolName) || 0;
      if (toolLimit !== undefined && currentToolCount + 1 > toolLimit) {
        throw new BudgetExhaustionException(
          [`Per-tool limit for "${toolName}" reached (${currentToolCount + 1} > ${toolLimit})`],
          this.getSnapshot()
        );
      }

      this.reservedToolCalls += 1;
      let committed = false;
      let released = false;

      return {
        commit: () => {
          if (committed || released) return;
          committed = true;
          this.reservedToolCalls = Math.max(0, this.reservedToolCalls - 1);
          this.toolCalls += 1;
          this.perToolCalls.set(toolName, currentToolCount + 1);
        },
        release: () => {
          if (committed || released) return;
          released = true;
          this.reservedToolCalls = Math.max(0, this.reservedToolCalls - 1);
        },
      };
    });
  }

  public recordRepairAttempt(): void {
    this.assertWithinBudget('recordRepairAttempt');
    this.repairAttempts += 1;
    this.assertWithinBudget('recordRepairAttempt');
  }

  public recordVerificationRun(): void {
    this.assertWithinBudget('recordVerificationRun');
    this.verificationRuns += 1;
    this.assertWithinBudget('recordVerificationRun');
  }
}

// Global registry of active budgets per run/conversation
const activeBudgets = new Map<string, BudgetManager>();

export function getOrCreateRunBudget(
  runKey: string,
  customLimits?: Partial<BudgetLimits>
): BudgetManager {
  let budget = activeBudgets.get(runKey);
  if (!budget) {
    budget = new BudgetManager(customLimits);
    activeBudgets.set(runKey, budget);
  }
  return budget;
}

export function clearRunBudget(runKey: string): void {
  activeBudgets.delete(runKey);
}

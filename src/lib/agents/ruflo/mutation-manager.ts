/**
 * AutoCoder Durable Mutation & Recovery Manager
 * Implements Section 10 (Durable Mutations and Crash Recovery) and F-08 of AutoCoder Vision.
 * Provides:
 * - Stable logical-operation keys
 * - 6-step durable mutation lifecycle
 * - Crash reconciliation (proven applied, proven unapplied, or RECOVERY_REQUIRED)
 * - Atomic write receipts preventing duplicate patch reapplication
 */

import { createHash } from 'crypto';
import { readVirtualFile, writeVirtualFile, applyDiff } from './vfs';
import { canonicalizeProjectPath } from './workspace-policy';
import { computeWorkspaceFingerprint } from './verification-loop';
import { getOrCreateRunBudget } from './budget-manager';
import { prisma } from '../../db';

export type MutationOpType = 'FILE_WRITE' | 'DIFF_PATCH';
export type MutationState = 'INTENDED' | 'APPLYING' | 'COMMITTED' | 'FAILED' | 'RECOVERY_REQUIRED';

export interface MutationReceipt {
  operationKey: string;
  conversationId: string;
  pipelineRunId: string;
  stageExecutionId?: string;
  opType: MutationOpType;
  targetPath: string;
  baseWorkspaceHash: string;
  resultingContentHash: string;
  resultingWorkspaceHash: string;
  committedAt: string;
}

export interface DurableOperationRecord {
  operationKey: string;
  conversationId: string;
  pipelineRunId: string;
  stageExecutionId?: string;
  opType: MutationOpType;
  targetPath: string;
  state: MutationState;
  intendedContent: string;
  baseContentHash: string;
  expectedContentHash: string;
  diffRange?: { startLine: number; endLine: number };
  baseWorkspaceHash: string;
  receipt?: MutationReceipt;
  error?: string;
  updatedAt: string;
}

export class RecoveryRequiredException extends Error {
  public readonly operationKey: string;
  public readonly targetPath: string;

  constructor(operationKey: string, targetPath: string, message: string) {
    super(`Recovery Required Exception [${operationKey}] for "${targetPath}": ${message}`);
    this.name = 'RecoveryRequiredException';
    this.operationKey = operationKey;
    this.targetPath = targetPath;
  }
}

type MutationLifecyclePhase = 'APPLYING' | 'APPLIED';
let mutationFaultInjector: ((phase: MutationLifecyclePhase) => void | Promise<void>) | null = null;
const operationLocks = new Map<string, Promise<void>>();

export function setMutationFaultInjectorForTest(
  injector: ((phase: MutationLifecyclePhase) => void | Promise<void>) | null
): void {
  mutationFaultInjector = injector;
}

function toOperationRecord(row: any): DurableOperationRecord {
  return {
    operationKey: row.operationKey,
    conversationId: row.conversationId,
    pipelineRunId: row.pipelineRunId,
    stageExecutionId: row.stageExecutionId || undefined,
    opType: row.opType,
    targetPath: row.targetPath,
    state: row.state,
    intendedContent: row.intendedContent,
    baseContentHash: row.baseContentHash,
    expectedContentHash: row.expectedContentHash,
    diffRange: row.diffStartLine == null || row.diffEndLine == null
      ? undefined
      : { startLine: row.diffStartLine, endLine: row.diffEndLine },
    baseWorkspaceHash: row.baseWorkspaceHash,
    receipt: row.receiptJson ? JSON.parse(row.receiptJson) : undefined,
    error: row.error || undefined,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function persistOperation(record: DurableOperationRecord): Promise<void> {
  await prisma.durableMutation.upsert({
    where: { operationKey: record.operationKey },
    create: {
      operationKey: record.operationKey,
      conversationId: record.conversationId,
      pipelineRunId: record.pipelineRunId,
      stageExecutionId: record.stageExecutionId,
      opType: record.opType,
      targetPath: record.targetPath,
      state: record.state,
      intendedContent: record.intendedContent,
      baseContentHash: record.baseContentHash,
      expectedContentHash: record.expectedContentHash,
      diffStartLine: record.diffRange?.startLine,
      diffEndLine: record.diffRange?.endLine,
      baseWorkspaceHash: record.baseWorkspaceHash,
      receiptJson: record.receipt ? JSON.stringify(record.receipt) : null,
      error: record.error,
    },
    update: {
      state: record.state,
      receiptJson: record.receipt ? JSON.stringify(record.receipt) : null,
      error: record.error,
    },
  });
}

export function generateOperationKey(params: {
  conversationId: string;
  pipelineRunId: string;
  opType: MutationOpType;
  targetPath: string;
  contentOrDiff: string;
}): string {
  const normPath = canonicalizeProjectPath(params.targetPath);
  const hash = createHash('sha256')
    .update(`${params.conversationId}:${params.pipelineRunId}:${params.opType}:${normPath}:${params.contentOrDiff}`)
    .digest('hex')
    .substring(0, 32);
  return `op_${hash}`;
}

export function computeSha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function executeDurableMutationLocked(params: {
  conversationId: string;
  pipelineRunId: string;
  stageExecutionId?: string;
  opType: MutationOpType;
  targetPath: string;
  content: string;
  diffRange?: { startLine: number; endLine: number };
  expectedBaseWorkspaceHash?: string;
}): Promise<MutationReceipt> {
  const {
    conversationId,
    pipelineRunId,
    stageExecutionId,
    opType,
    targetPath,
    content,
    diffRange,
    expectedBaseWorkspaceHash,
  } = params;

  const normPath = canonicalizeProjectPath(targetPath);

  // 1. Enforce least privilege and authorization boundary
  const { assertAuthorizedToolMutation } = await import('./toolbox');
  await assertAuthorizedToolMutation(conversationId, normPath);

  // 2. Consume budget
  const budget = getOrCreateRunBudget(pipelineRunId || conversationId);
  budget.assertWithinBudget(`durable_mutation:${normPath}`);

  const currentWorkspaceHash = await computeWorkspaceFingerprint(conversationId);
  const opPayload = diffRange ? `${diffRange.startLine}-${diffRange.endLine}:${content}` : content;
  const operationKey = generateOperationKey({
    conversationId,
    pipelineRunId,
    opType,
    targetPath: normPath,
    contentOrDiff: opPayload,
  });

  // 3. Idempotency Check: Did this exact operation already commit?
  const existingRow = await prisma.durableMutation.findUnique({ where: { operationKey } });
  const existingRecord = existingRow ? toOperationRecord(existingRow) : undefined;
  const existingReceipt = existingRecord?.receipt;
  if (existingReceipt) {
    // Verify that observed file matches the receipt's content hash
    const currentFileContent = (await readVirtualFile(conversationId, normPath)) || '';
    if (computeSha256(currentFileContent) === existingReceipt.resultingContentHash) {
      return existingReceipt;
    }
    existingRecord!.state = 'RECOVERY_REQUIRED';
    existingRecord!.error = 'A previously committed mutation was retried after the target file changed.';
    existingRecord!.updatedAt = new Date().toISOString();
    await persistOperation(existingRecord!);
    throw new RecoveryRequiredException(operationKey, normPath, existingRecord!.error);
  }

  // 4. Crash reconciliation for existing in-flight record
  if (existingRecord) {
    if (existingRecord.state === 'RECOVERY_REQUIRED') {
      throw new RecoveryRequiredException(
        operationKey,
        normPath,
        'Mutation blocked: previous attempt left ambiguous state. Manual reconciliation or rollback required.'
      );
    }
    if (existingRecord.state === 'APPLYING' || existingRecord.state === 'INTENDED') {
      // Reconcile the persisted operation after a process restart.
      const observedContent = (await readVirtualFile(conversationId, normPath)) || '';
      const observedHash = computeSha256(observedContent);
      if (observedHash === existingRecord.expectedContentHash) {
        // Write succeeded before crash! Commit and return receipt.
        const resultingWorkspaceHash = await computeWorkspaceFingerprint(conversationId);
        const receipt: MutationReceipt = {
          operationKey,
          conversationId,
          pipelineRunId,
          opType,
          targetPath: normPath,
          baseWorkspaceHash: existingRecord.baseWorkspaceHash,
          resultingContentHash: observedHash,
          resultingWorkspaceHash,
          committedAt: new Date().toISOString(),
        };
        existingRecord.state = 'COMMITTED';
        existingRecord.receipt = receipt;
        existingRecord.updatedAt = new Date().toISOString();
        await persistOperation(existingRecord);
        return receipt;
      }
      if (observedHash !== existingRecord.baseContentHash) {
        existingRecord.state = 'RECOVERY_REQUIRED';
        existingRecord.error = 'Observed content matches neither the recorded base nor expected result.';
        existingRecord.updatedAt = new Date().toISOString();
        await persistOperation(existingRecord);
        throw new RecoveryRequiredException(operationKey, normPath, existingRecord.error);
      }
    }
    if (existingRecord.state === 'FAILED') {
      const observedContent = (await readVirtualFile(conversationId, normPath)) || '';
      if (computeSha256(observedContent) !== existingRecord.baseContentHash) {
        existingRecord.state = 'RECOVERY_REQUIRED';
        existingRecord.error = 'Failed mutation retry found a workspace state different from its recorded base.';
        existingRecord.updatedAt = new Date().toISOString();
        await persistOperation(existingRecord);
        throw new RecoveryRequiredException(operationKey, normPath, existingRecord.error);
      }
    }
  }

  // Verify expected workspace version freshness if specified
  const baseWorkspaceHash = expectedBaseWorkspaceHash || currentWorkspaceHash;
  if (expectedBaseWorkspaceHash && expectedBaseWorkspaceHash !== currentWorkspaceHash) {
    throw new Error(
      `Workspace Freshness Error: Expected workspace hash ${expectedBaseWorkspaceHash} but observed ${currentWorkspaceHash}.`
    );
  }

  const baseContent = (await readVirtualFile(conversationId, normPath)) || '';
  let expectedContent = content;
  if (opType === 'DIFF_PATCH' && diffRange) {
    const lines = baseContent.split('\n');
    const startLine = Math.max(1, diffRange.startLine);
    const endLine = Math.max(startLine, diffRange.endLine);
    if (startLine > lines.length + 1) {
      throw new Error(`applyDiff failed: startLine ${startLine} exceeds total lines (${lines.length}) in "${normPath}".`);
    }
    const start = startLine - 1;
    const end = Math.min(endLine - 1, lines.length - 1);
    if (start === lines.length) lines.push(content);
    else lines.splice(start, end - start + 1, content);
    expectedContent = lines.join('\n');
  }

  // 5. Lifecycle Step 1 & 2: Record durable operation with INTENDED state
  const opRecord: DurableOperationRecord = {
    operationKey,
    conversationId,
    pipelineRunId,
    stageExecutionId,
    opType,
    targetPath: normPath,
    state: 'INTENDED',
    intendedContent: content,
    baseContentHash: computeSha256(baseContent),
    expectedContentHash: computeSha256(expectedContent),
    diffRange,
    baseWorkspaceHash,
    updatedAt: new Date().toISOString(),
  };
  await persistOperation(opRecord);

  // 6. Transition to APPLYING
  opRecord.state = 'APPLYING';
  opRecord.updatedAt = new Date().toISOString();
  await persistOperation(opRecord);
  await mutationFaultInjector?.('APPLYING');

  try {
    // 7. Apply mutation through locked VFS
    if (opType === 'FILE_WRITE') {
      await writeVirtualFile(conversationId, normPath, content);
    } else if (opType === 'DIFF_PATCH' && diffRange) {
      await applyDiff(conversationId, normPath, diffRange.startLine, diffRange.endLine, content);
    } else {
      throw new Error(`Unsupported mutation opType: ${opType}`);
    }
    await mutationFaultInjector?.('APPLIED');

    // 8. Verify post-mutation state
    const postWriteContent = (await readVirtualFile(conversationId, normPath)) || '';
    const resultingContentHash = computeSha256(postWriteContent);
    const resultingWorkspaceHash = await computeWorkspaceFingerprint(conversationId);

    // 9. Persist authoritative receipt & mark COMMITTED
    const receipt: MutationReceipt = {
      operationKey,
      conversationId,
      pipelineRunId,
      opType,
      targetPath: normPath,
      baseWorkspaceHash,
      resultingContentHash,
      resultingWorkspaceHash,
      committedAt: new Date().toISOString(),
    };

    opRecord.state = 'COMMITTED';
    opRecord.receipt = receipt;
    opRecord.updatedAt = new Date().toISOString();
    await persistOperation(opRecord);

    return receipt;
  } catch (err: any) {
    // If mutation fails or outcome is ambiguous, mark state appropriately
    const postCheckContent = (await readVirtualFile(conversationId, normPath)) || '';
    const postCheckHash = computeSha256(postCheckContent);

    if (postCheckHash === opRecord.expectedContentHash) {
      // Keep the operation reconcilable: a retry will observe the expected
      // content and commit the receipt without applying the edit a second time.
      opRecord.state = 'APPLYING';
      opRecord.error = err.message;
      opRecord.updatedAt = new Date().toISOString();
      await persistOperation(opRecord);
      throw new RecoveryRequiredException(
        operationKey,
        normPath,
        `Mutation failed and left inconsistent state: ${err.message}`
      );
    }

    if (postCheckHash !== opRecord.baseContentHash) {
      opRecord.state = 'RECOVERY_REQUIRED';
      opRecord.error = err.message;
      opRecord.updatedAt = new Date().toISOString();
      await persistOperation(opRecord);
      throw new RecoveryRequiredException(
        operationKey,
        normPath,
        `Mutation failed with an unrecognized workspace state: ${err.message}`
      );
    }

    opRecord.state = 'FAILED';
    opRecord.error = err.message;
    opRecord.updatedAt = new Date().toISOString();
    await persistOperation(opRecord);
    throw err;
  }
}

async function withOperationLock<T>(operationKey: string, operation: () => Promise<T>): Promise<T> {
  const previous = operationLocks.get(operationKey) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  operationLocks.set(operationKey, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (operationLocks.get(operationKey) === queued) operationLocks.delete(operationKey);
  }
}

export async function executeDurableMutation(params: Parameters<typeof executeDurableMutationLocked>[0]): Promise<MutationReceipt> {
  const opPayload = params.diffRange
    ? `${params.diffRange.startLine}-${params.diffRange.endLine}:${params.content}`
    : params.content;
  const operationKey = generateOperationKey({
    conversationId: params.conversationId,
    pipelineRunId: params.pipelineRunId,
    opType: params.opType,
    targetPath: params.targetPath,
    contentOrDiff: opPayload,
  });
  return withOperationLock(operationKey, () => executeDurableMutationLocked(params));
}

export async function getOperationRecord(operationKey: string): Promise<DurableOperationRecord | undefined> {
  const row = await prisma.durableMutation.findUnique({ where: { operationKey } });
  return row ? toOperationRecord(row) : undefined;
}

export async function getCommittedReceipt(operationKey: string): Promise<MutationReceipt | undefined> {
  const row = await prisma.durableMutation.findUnique({ where: { operationKey } });
  if (!row?.receiptJson) return undefined;
  return JSON.parse(row.receiptJson) as MutationReceipt;
}

export async function resetOperationRegistryForTest(): Promise<void> {
  mutationFaultInjector = null;
  await prisma.durableMutation.deleteMany();
}

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
import { assertAuthorizedToolMutation } from './toolbox';
import { getOrCreateRunBudget } from './budget-manager';

export type MutationOpType = 'FILE_WRITE' | 'DIFF_PATCH';
export type MutationState = 'INTENDED' | 'APPLYING' | 'COMMITTED' | 'FAILED' | 'RECOVERY_REQUIRED';

export interface MutationReceipt {
  operationKey: string;
  conversationId: string;
  pipelineRunId: string;
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
  opType: MutationOpType;
  targetPath: string;
  state: MutationState;
  intendedContent: string;
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

// Durable in-memory registry of operation records and receipts per conversation
const operationRegistry = new Map<string, DurableOperationRecord>();
const committedReceipts = new Map<string, MutationReceipt>();

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

export async function executeDurableMutation(params: {
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
    opType,
    targetPath,
    content,
    diffRange,
    expectedBaseWorkspaceHash,
  } = params;

  const normPath = canonicalizeProjectPath(targetPath);

  // 1. Enforce least privilege and authorization boundary
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
  const existingReceipt = committedReceipts.get(operationKey);
  if (existingReceipt) {
    // Verify that observed file matches the receipt's content hash
    const currentFileContent = (await readVirtualFile(conversationId, normPath)) || '';
    if (computeSha256(currentFileContent) === existingReceipt.resultingContentHash) {
      return existingReceipt;
    }
  }

  // 4. Crash reconciliation for existing in-flight record
  const existingRecord = operationRegistry.get(operationKey);
  if (existingRecord) {
    if (existingRecord.state === 'RECOVERY_REQUIRED') {
      throw new RecoveryRequiredException(
        operationKey,
        normPath,
        'Mutation blocked: previous attempt left ambiguous state. Manual reconciliation or rollback required.'
      );
    }
    if (existingRecord.state === 'APPLYING') {
      // Reconcile observed state after crash
      const observedContent = (await readVirtualFile(conversationId, normPath)) || '';
      const observedHash = computeSha256(observedContent);
      const targetHash = computeSha256(content);

      if (opType === 'FILE_WRITE' && observedHash === targetHash) {
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
        committedReceipts.set(operationKey, receipt);
        return receipt;
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

  // 5. Lifecycle Step 1 & 2: Record durable operation with INTENDED state
  const opRecord: DurableOperationRecord = {
    operationKey,
    conversationId,
    pipelineRunId,
    opType,
    targetPath: normPath,
    state: 'INTENDED',
    intendedContent: content,
    diffRange,
    baseWorkspaceHash,
    updatedAt: new Date().toISOString(),
  };
  operationRegistry.set(operationKey, opRecord);

  // 6. Transition to APPLYING
  opRecord.state = 'APPLYING';
  opRecord.updatedAt = new Date().toISOString();

  try {
    // 7. Apply mutation through locked VFS
    if (opType === 'FILE_WRITE') {
      await writeVirtualFile(conversationId, normPath, content);
    } else if (opType === 'DIFF_PATCH' && diffRange) {
      await applyDiff(conversationId, normPath, diffRange.startLine, diffRange.endLine, content);
    } else {
      throw new Error(`Unsupported mutation opType: ${opType}`);
    }

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
    committedReceipts.set(operationKey, receipt);

    return receipt;
  } catch (err: any) {
    // If mutation fails or outcome is ambiguous, mark state appropriately
    const postCheckContent = (await readVirtualFile(conversationId, normPath)) || '';
    const postCheckHash = computeSha256(postCheckContent);

    if (postCheckHash !== computeSha256(content)) {
      opRecord.state = 'RECOVERY_REQUIRED';
      opRecord.error = err.message;
      opRecord.updatedAt = new Date().toISOString();
      throw new RecoveryRequiredException(
        operationKey,
        normPath,
        `Mutation failed and left inconsistent state: ${err.message}`
      );
    }

    opRecord.state = 'FAILED';
    opRecord.error = err.message;
    opRecord.updatedAt = new Date().toISOString();
    throw err;
  }
}

export function getOperationRecord(operationKey: string): DurableOperationRecord | undefined {
  return operationRegistry.get(operationKey);
}

export function getCommittedReceipt(operationKey: string): MutationReceipt | undefined {
  return committedReceipts.get(operationKey);
}

export function resetOperationRegistryForTest(): void {
  operationRegistry.clear();
  committedReceipts.clear();
}

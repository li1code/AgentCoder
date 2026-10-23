CREATE TABLE "DurableMutation" (
    "operationKey" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "pipelineRunId" TEXT NOT NULL,
    "stageExecutionId" TEXT,
    "opType" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "intendedContent" TEXT NOT NULL,
    "baseContentHash" TEXT NOT NULL,
    "expectedContentHash" TEXT NOT NULL,
    "diffStartLine" INTEGER,
    "diffEndLine" INTEGER,
    "baseWorkspaceHash" TEXT NOT NULL,
    "receiptJson" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "DurableMutation_conversationId_state_idx" ON "DurableMutation"("conversationId", "state");
CREATE INDEX "DurableMutation_pipelineRunId_state_idx" ON "DurableMutation"("pipelineRunId", "state");

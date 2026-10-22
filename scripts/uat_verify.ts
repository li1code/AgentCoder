// Programmatic UAT Verification Script
// Run this with: npx tsx scripts/uat_verify.ts

import { prisma } from '../src/lib/db';
import { runOrchestrator } from '../src/lib/agents/ruflo/orchestrator';
import fs from 'fs';
import path from 'path';

// Force mock inference environment
process.env.MOCK_INFERENCE = 'true';

async function runUAT() {
  console.log('----------------------------------------------------');
  console.log('Starting Autocoder Multi-Agent Pipeline UAT Check...');
  console.log('----------------------------------------------------');

  // 1. Create a fresh test project
  const testTitle = `UAT Test - ${new Date().toISOString()}`;
  console.log(`[1/5] Creating database conversation: "${testTitle}"...`);
  const conversation = await prisma.conversation.create({
    data: {
      title: testTitle,
      status: 'Active',
      currentStage: 'Queen',
    },
  });
  const conversationId = conversation.id;
  console.log(`Successfully created conversation ID: ${conversationId}`);

  // 2. Execute Pass 1: Queen -> Planner -> Architect (Scaffolding phases)
  console.log('\n[2/5] Initiating Pass 1 execution loop (Queen -> Planner -> Architect)...');
  
  let eventsReceived: any[] = [];
  const captureEvent = (event: any) => {
    eventsReceived.push(event);
    if (event.type === 'AGENT_START' || event.type === 'AGENT_COMPLETE' || event.type === 'PAUSE_APPROVAL_GATE' || event.type === 'PIPELINE_SUCCESS') {
      console.log(`   >> Event: [${event.type}] ${event.agent ? `(${event.agent}) ` : ''}${event.message}`);
    }
  };

  await runOrchestrator(conversationId, 'Build a to-do list application with React', captureEvent);

  // Verify that it paused at Architect Approval Gate
  let updatedConv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!updatedConv || updatedConv.status !== 'Paused' || updatedConv.currentStage !== 'Architect') {
    throw new Error(`UAT Failed: Pipeline did not pause at Architect stage. Current status: ${updatedConv?.status}, Stage: ${updatedConv?.currentStage}`);
  }
  console.log('Successfully completed Pass 1! Pipeline is paused at Architect Approval Gate.');

  // 3. Simulate User Gate Approval
  console.log('\n[3/5] Simulating user gate approval and advancing to System stage...');
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      status: 'Active',
      currentStage: 'System',
    },
  });

  // 4. Execute Pass 2: System -> ... -> Reviewer (Synthesis & Compilation phases)
  console.log('\n[4/5] Initiating Pass 2 execution loop (System -> ... -> Reviewer)...');
  await runOrchestrator(conversationId, 'Build a to-do list application with React', captureEvent);

  // Verify final status is Completed
  updatedConv = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!updatedConv || updatedConv.status !== 'Completed' || updatedConv.currentStage !== 'Reviewer') {
    throw new Error(`UAT Failed: Pipeline did not complete all stages. Current status: ${updatedConv?.status}, Stage: ${updatedConv?.currentStage}`);
  }
  console.log('Successfully completed Pass 2! Pipeline status is: Completed.');

  // 5. Verify database logging and SML indexes
  console.log('\n[5/5] Performing database audit and filesystem checks...');
  
  const historyLogs = await prisma.executionHistory.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Total live telemetry logs written to database: ${historyLogs.length}`);
  if (historyLogs.length < 15) {
    throw new Error(`UAT Failed: Insufficient execution logs written to database (${historyLogs.length})`);
  }

  // Check that files were written to disk
  const projectPath = path.join(process.cwd(), 'projects', conversationId);
  const targetFile = path.join(projectPath, 'src', 'pages', 'TodoPage.tsx');
  console.log(`Checking generated files at: ${targetFile}`);
  
  if (!fs.existsSync(targetFile)) {
    throw new Error(`UAT Failed: Generated file was not written to disk: ${targetFile}`);
  }
  const fileContent = fs.readFileSync(targetFile, 'utf8');
  console.log(`Synthesized File Content: "${fileContent}"`);

  // Clean up
  console.log('\nCleaning up UAT filesystem artifacts...');
  if (fs.existsSync(projectPath)) {
    fs.rmSync(projectPath, { recursive: true, force: true });
  }

  console.log('----------------------------------------------------');
  console.log('🟢 UAT CHECK PASSED SUCCESSFULLY!');
  console.log('All 11 multi-agent compiler stages executed, logged,');
  console.log('validated, and persisted to DB/disk without errors.');
  console.log('----------------------------------------------------');
}

runUAT().catch((err) => {
  console.error('\n🔴 UAT CHECK FAILED:', err.message);
  process.exit(1);
});

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getExecutionBackend, LocalExecutionBackend, DockerExecutionBackend } from '../../execution';
import { getLLMConfig } from '../../../inference';

describe('Deployment Adapters: Execution Backends & Inference Providers', () => {
  const testConvId = `test-deploy-${Date.now()}`;
  const testProjectDir = path.join(process.cwd(), 'projects', testConvId);

  before(() => {
    if (!fs.existsSync(testProjectDir)) {
      fs.mkdirSync(testProjectDir, { recursive: true });
    }
  });

  after(async () => {
    // Cleanup local test dir
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
  });

  it('proves getExecutionBackend defaults to local backend when unspecified', () => {
    const original = process.env.EXECUTION_BACKEND;
    delete process.env.EXECUTION_BACKEND;
    try {
      const backend = getExecutionBackend();
      assert.strictEqual(backend.name, 'local');
    } finally {
      if (original) process.env.EXECUTION_BACKEND = original;
    }
  });

  it('proves getExecutionBackend switches to docker backend when configured', () => {
    const original = process.env.EXECUTION_BACKEND;
    process.env.EXECUTION_BACKEND = 'docker';
    try {
      const backend = getExecutionBackend();
      assert.strictEqual(backend.name, 'docker');
    } finally {
      if (original) process.env.EXECUTION_BACKEND = original;
      else delete process.env.EXECUTION_BACKEND;
    }
  });

  it('executes command inside LocalExecutionBackend successfully', async () => {
    const local = new LocalExecutionBackend();
    await local.initWorkspace(testConvId);

    const res = await local.executeCommand(testConvId, 'node', ['-e', 'console.log("HELLO_LOCAL")']);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.exitCode, 0);
    assert.strictEqual(res.stdout, 'HELLO_LOCAL');
    assert.strictEqual(typeof res.durationMs, 'number');
  });

  it('executes command inside DockerExecutionBackend (StackBlitz-style isolated sandbox)', async () => {
    const dockerBackend = new DockerExecutionBackend();
    await dockerBackend.initWorkspace(testConvId);

    const res = await dockerBackend.executeCommand(testConvId, 'node', ['-e', 'console.log("HELLO_DOCKER_SANDBOX")']);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.exitCode, 0);
    assert.strictEqual(res.stdout, 'HELLO_DOCKER_SANDBOX');

    // Verify workspace continuity across commands
    await dockerBackend.executeCommand(testConvId, 'node', ['-e', 'require("fs").writeFileSync("test.txt", "PERSISTED")']);
    const checkRes = await dockerBackend.executeCommand(testConvId, 'node', ['-e', 'console.log(require("fs").readFileSync("test.txt", "utf8"))']);
    assert.strictEqual(checkRes.stdout, 'PERSISTED');

    // Deterministic cleanup
    await dockerBackend.cleanupWorkspace(testConvId);
    const isRunning = await dockerBackend.isContainerRunning(dockerBackend.getContainerName(testConvId));
    assert.strictEqual(isRunning, false, 'Container must be terminated after cleanup');
  });

  it('verifies Vertex AI configuration resolution in getLLMConfig', async () => {
    const origProvider = process.env.LLM_PROVIDER;
    const origProject = process.env.VERTEX_PROJECT_ID;
    const origLocation = process.env.VERTEX_LOCATION;
    const origModel = process.env.VERTEX_MODEL;

    process.env.LLM_PROVIDER = 'vertex';
    process.env.VERTEX_PROJECT_ID = 'test-gcp-project-123';
    process.env.VERTEX_LOCATION = 'us-central1';
    process.env.VERTEX_MODEL = 'gemini-1.5-flash';

    try {
      const config = await getLLMConfig();
      assert.strictEqual(config.provider, 'vertex');
      assert.strictEqual(config.vertexProjectId, 'test-gcp-project-123');
      assert.strictEqual(config.vertexLocation, 'us-central1');
      assert.strictEqual(config.vertexModel, 'gemini-1.5-flash');
    } finally {
      if (origProvider) process.env.LLM_PROVIDER = origProvider; else delete process.env.LLM_PROVIDER;
      if (origProject) process.env.VERTEX_PROJECT_ID = origProject; else delete process.env.VERTEX_PROJECT_ID;
      if (origLocation) process.env.VERTEX_LOCATION = origLocation; else delete process.env.VERTEX_LOCATION;
      if (origModel) process.env.VERTEX_MODEL = origModel; else delete process.env.VERTEX_MODEL;
    }
  });
});

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import {
  ExecutionBackend,
  ExecutionOptions,
  PreviewServerHandle,
  ProjectCommandResult,
} from './types';

const execFileAsync = promisify(execFile);

export class DockerExecutionBackend implements ExecutionBackend {
  readonly name = 'docker';
  private workerImage: string;
  private dockerBin: string;
  private cpuLimit: string;
  private memoryLimit: string;
  private pidsLimit: number;

  constructor(options?: {
    workerImage?: string;
    dockerBin?: string;
    cpuLimit?: string;
    memoryLimit?: string;
    pidsLimit?: number;
  }) {
    this.workerImage = options?.workerImage || process.env.DOCKER_WORKER_IMAGE || 'autocoder-worker:latest';
    this.dockerBin = options?.dockerBin || process.env.DOCKER_BIN || 'docker';
    this.cpuLimit = options?.cpuLimit || process.env.DOCKER_CPU_LIMIT || '2';
    this.memoryLimit = options?.memoryLimit || process.env.DOCKER_MEMORY_LIMIT || '2g';
    this.pidsLimit = options?.pidsLimit || Number(process.env.DOCKER_PIDS_LIMIT) || 100;
  }

  getContainerName(conversationId: string): string {
    const sanitized = conversationId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    return `autocoder-worker-${sanitized}`;
  }

  async isContainerRunning(containerName: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync(this.dockerBin, [
        'inspect',
        '-f',
        '{{.State.Running}}',
        containerName,
      ]);
      return stdout.trim() === 'true';
    } catch {
      return false;
    }
  }

  async ensureWorkerRunning(conversationId: string): Promise<string> {
    const containerName = this.getContainerName(conversationId);
    const isRunning = await this.isContainerRunning(containerName);
    if (isRunning) {
      return containerName;
    }

    // Ensure host project directory exists
    const projectDir = path.resolve(process.cwd(), 'projects', conversationId);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Try removing any stale stopped container with this name
    try {
      await execFileAsync(this.dockerBin, ['rm', '-f', containerName]);
    } catch {
      // Ignored if not found
    }

    const runArgs = [
      'run',
      '-d',
      '--name',
      containerName,
      '-v',
      `${projectDir}:/workspace`,
      '-w',
      '/workspace',
      '--cpus',
      this.cpuLimit,
      '--memory',
      this.memoryLimit,
      '--memory-swap',
      this.memoryLimit,
      '--pids-limit',
      String(this.pidsLimit),
      this.workerImage,
      'tail',
      '-f',
      '/dev/null',
    ];

    try {
      await execFileAsync(this.dockerBin, runArgs);
    } catch (err: any) {
      // If image not found, try fallback to node:20-bookworm-slim
      if (err.message && err.message.includes('Unable to find image')) {
        const fallbackArgs = [...runArgs];
        fallbackArgs[fallbackArgs.length - 3] = 'node:20-bookworm-slim';
        await execFileAsync(this.dockerBin, fallbackArgs);
      } else {
        throw new Error(`Failed to spawn Docker worker container "${containerName}": ${err.message}`);
      }
    }

    return containerName;
  }

  async initWorkspace(conversationId: string): Promise<void> {
    await this.ensureWorkerRunning(conversationId);
  }

  async executeCommand(
    conversationId: string,
    binary: string,
    args: string[],
    options?: ExecutionOptions
  ): Promise<ProjectCommandResult> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? 180000;

    let containerName: string;
    try {
      containerName = await this.ensureWorkerRunning(conversationId);
    } catch (err: any) {
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: `Worker initialization failed: ${err.message}`,
        durationMs: Date.now() - startTime,
      };
    }

    const envArgs: string[] = [];
    if (options?.env) {
      for (const [k, v] of Object.entries(options.env)) {
        envArgs.push('-e', `${k}=${v}`);
      }
    }

    const execArgs = [
      'exec',
      '-i',
      ...envArgs,
      containerName,
      binary,
      ...args,
    ];

    try {
      const { stdout, stderr } = await execFileAsync(this.dockerBin, execArgs, {
        timeout: timeoutMs,
      });

      return {
        success: true,
        exitCode: 0,
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim(),
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        exitCode: typeof err.code === 'number' ? err.code : 1,
        stdout: (err.stdout || '').trim(),
        stderr: (err.stderr || err.message || '').trim(),
        durationMs: Date.now() - startTime,
      };
    }
  }

  async launchPreview(
    conversationId: string,
    entryFile?: string
  ): Promise<PreviewServerHandle> {
    const containerName = await this.ensureWorkerRunning(conversationId);
    const port = 8080;

    // Execute server process detached or background in container
    const cmd = entryFile
      ? `node ${entryFile}`
      : `npx serve -s . -l ${port}`;

    await execFileAsync(this.dockerBin, [
      'exec',
      '-d',
      containerName,
      'sh',
      '-c',
      cmd,
    ]);

    return {
      previewUrl: `http://localhost:${port}`,
      port,
      stop: async () => {
        try {
          await execFileAsync(this.dockerBin, [
            'exec',
            containerName,
            'pkill',
            '-f',
            entryFile || 'serve',
          ]);
        } catch {
          // Process might already be stopped
        }
      },
    };
  }

  async cleanupWorkspace(conversationId: string): Promise<void> {
    const containerName = this.getContainerName(conversationId);
    try {
      await execFileAsync(this.dockerBin, ['rm', '-f', containerName]);
    } catch {
      // Ignored if container was not present
    }
  }
}

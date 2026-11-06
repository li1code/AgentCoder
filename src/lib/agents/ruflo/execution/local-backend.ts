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

export class LocalExecutionBackend implements ExecutionBackend {
  readonly name = 'local';

  async initWorkspace(conversationId: string): Promise<void> {
    const projectDir = path.join(process.cwd(), 'projects', conversationId);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }
  }

  async executeCommand(
    conversationId: string,
    binary: string,
    args: string[],
    options?: ExecutionOptions
  ): Promise<ProjectCommandResult> {
    const projectDir = path.join(process.cwd(), 'projects', conversationId);
    if (!fs.existsSync(projectDir)) {
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: `Project directory does not exist for conversation ${conversationId}.`,
        durationMs: 0,
      };
    }

    const resolvedBin =
      process.platform === 'win32' && (binary === 'npm' || binary === 'npx')
        ? `${binary}.cmd`
        : binary;

    const timeoutMs = options?.timeoutMs ?? 180000;
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execFileAsync(resolvedBin, args, {
        cwd: options?.cwd || projectDir,
        timeout: timeoutMs,
        windowsHide: true,
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          HOME: process.env.HOME || process.env.USERPROFILE,
          USERPROFILE: process.env.USERPROFILE,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          NODE_ENV: 'development',
          ...(options?.env || {}),
        },
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
    const projectDir = path.join(process.cwd(), 'projects', conversationId);
    const port = 8080;
    const sanitizedEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      PORT: String(port),
      NODE_ENV: 'development',
    };

    let childProc: any;

    if (entryFile) {
      childProc = execFile(
        process.execPath,
        [entryFile],
        { cwd: projectDir, env: sanitizedEnv, timeout: 3600000, windowsHide: true },
        () => {}
      );
    } else {
      const npxBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      childProc = execFile(
        npxBin,
        ['serve', '-s', '.', '-l', String(port)],
        { cwd: projectDir, env: sanitizedEnv, timeout: 3600000, windowsHide: true },
        () => {}
      );
    }

    return {
      previewUrl: `http://localhost:${port}`,
      port,
      stop: async () => {
        if (childProc && !childProc.killed) {
          childProc.kill('SIGTERM');
        }
      },
    };
  }

  async cleanupWorkspace(conversationId: string): Promise<void> {
    // Local cleanup: no lingering containers, temporary memory cleanup only
  }
}

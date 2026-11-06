export interface ProjectCommandResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface PreviewServerHandle {
  previewUrl: string;
  port: number;
  stop: () => Promise<void>;
}

export interface ExecutionOptions {
  timeoutMs?: number;
  env?: Record<string, string>;
  cwd?: string;
  allowNetwork?: boolean;
}

export interface ExecutionBackend {
  readonly name: string;

  /**
   * Initializes or verifies workspace readiness for the given conversation.
   */
  initWorkspace(conversationId: string): Promise<void>;

  /**
   * Executes a binary command (npm, npx, node, etc.) inside the project workspace.
   */
  executeCommand(
    conversationId: string,
    binary: string,
    args: string[],
    options?: ExecutionOptions
  ): Promise<ProjectCommandResult>;

  /**
   * Launches an interactive preview/dev server inside the workspace.
   */
  launchPreview(
    conversationId: string,
    entryFile?: string
  ): Promise<PreviewServerHandle>;

  /**
   * Cleans up running processes or containers associated with the conversation workspace.
   */
  cleanupWorkspace(conversationId: string): Promise<void>;
}

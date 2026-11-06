import { ExecutionBackend } from './types';
import { LocalExecutionBackend } from './local-backend';
import { DockerExecutionBackend } from './docker-backend';

export * from './types';
export * from './local-backend';
export * from './docker-backend';

let cachedBackend: ExecutionBackend | null = null;

export function getExecutionBackend(): ExecutionBackend {
  const backendType = (process.env.EXECUTION_BACKEND || 'local').toLowerCase().trim();
  
  if (backendType === 'docker') {
    if (!cachedBackend || cachedBackend.name !== 'docker') {
      cachedBackend = new DockerExecutionBackend();
    }
    return cachedBackend;
  }

  if (!cachedBackend || cachedBackend.name !== 'local') {
    cachedBackend = new LocalExecutionBackend();
  }
  return cachedBackend;
}

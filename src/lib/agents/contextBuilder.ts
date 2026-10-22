import { StageLedger } from './ruflo/memory';
import { AGENT_DEFS } from './ruflo/agents';

export async function buildUserContext(
  ledger: StageLedger,
  agentName: string
): Promise<string> {
  const agentDef = AGENT_DEFS[agentName];
  if (agentDef && typeof agentDef.getContext === 'function') {
    return await agentDef.getContext(ledger);
  }
  return '{}';
}

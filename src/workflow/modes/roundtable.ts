import type { AIProvider, RoundtableRoles } from '../../../shared/types';
import { AI_PROVIDERS, PROMPTS } from '../../../shared/constants';
import { checkAborted } from '../cancel';
import { sendRoleAssignment, sendWorkflowStatus } from '../events';
import { reserveProviderTurn } from '../sendAndWait';
import { runStep } from '../stepRunner';

export const ROUND_LABELS = ['開場立論', '交叉質疑', '攻防深化', '核心收斂', '真理浮現'];

export async function handleRoundtableMode(text: string, roles: RoundtableRoles): Promise<void> {
  const participants: AIProvider[] = [roles.first, roles.second, roles.third, roles.fourth];
  const history: { name: string; round: number; text: string }[] = [];

  for (let round = 1; round <= 5; round += 1) {
    for (const participant of participants) {
      checkAborted();
      const name = AI_PROVIDERS[participant].name;
      const roundLabel = ROUND_LABELS[round - 1];
      sendWorkflowStatus(`🔄 第${round}輪「${roundLabel}」— ${name} 發言中...`);
      const turn = reserveProviderTurn(participant);
      sendRoleAssignment(participant, `R${round}`, `第${round}輪`, turn);
      const prompt = PROMPTS.roundtable.buildPrompt(text, round, name, history);
      const response = (await runStep(participant, prompt, turn)).response;
      history.push({ name, round, text: response });
    }
  }

  sendWorkflowStatus('');
}

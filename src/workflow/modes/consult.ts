import type { ConsultRoles } from '../../../shared/types';
import { AI_PROVIDERS, PROMPTS } from '../../../shared/constants';
import { checkAborted } from '../cancel';
import { sendRoleAssignment, sendWorkflowStatus } from '../events';
import { reserveProviderTurn } from '../sendAndWait';
import { runStep } from '../stepRunner';

export async function handleConsultMode(text: string, roles: ConsultRoles): Promise<void> {
  const firstName = AI_PROVIDERS[roles.first].name;
  const secondName = AI_PROVIDERS[roles.second].name;
  const reviewerName = AI_PROVIDERS[roles.reviewer].name;
  const sumName = AI_PROVIDERS[roles.summary].name;

  checkAborted();
  sendWorkflowStatus(`🔍 ${firstName} 與 ${secondName} 同時回答中...`);
  const firstTurn = reserveProviderTurn(roles.first);
  const secondTurn = reserveProviderTurn(roles.second);
  sendRoleAssignment(roles.first, 'first', '先答 A', firstTurn);
  sendRoleAssignment(roles.second, 'second', '先答 B', secondTurn);
  const [firstResponse, secondResponse] = await Promise.all([
    runStep(roles.first, PROMPTS.consult.first(text), firstTurn).then((result) => result.response),
    runStep(roles.second, PROMPTS.consult.second(text), secondTurn).then((result) => result.response),
  ]);

  checkAborted();
  sendWorkflowStatus(`🔍 ${reviewerName} 審查中...`);
  let turn = reserveProviderTurn(roles.reviewer);
  sendRoleAssignment(roles.reviewer, 'reviewer', '審查', turn);
  const reviewerPrompt = PROMPTS.consult.reviewer(text, firstResponse, firstName, secondResponse, secondName);
  const reviewerResponse = (await runStep(roles.reviewer, reviewerPrompt, turn)).response;

  checkAborted();
  sendWorkflowStatus(`🔍 ${sumName} 總結中...`);
  turn = reserveProviderTurn(roles.summary);
  sendRoleAssignment(roles.summary, 'summary', '總結', turn);
  const summaryPrompt = PROMPTS.consult.summary(
    text,
    firstResponse,
    firstName,
    secondResponse,
    secondName,
    reviewerResponse,
    reviewerName,
  );
  await runStep(roles.summary, summaryPrompt, turn);
  sendWorkflowStatus('');
}

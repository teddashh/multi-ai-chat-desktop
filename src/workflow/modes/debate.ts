import type { DebateRoles } from '../../../shared/types';
import { AI_PROVIDERS, PROMPTS } from '../../../shared/constants';
import { checkAborted } from '../cancel';
import { sendRoleAssignment, sendWorkflowStatus } from '../events';
import { reserveProviderTurn } from '../sendAndWait';
import { runStep } from '../stepRunner';

export async function handleDebateMode(text: string, roles: DebateRoles): Promise<void> {
  const proName = AI_PROVIDERS[roles.pro].name;
  const conName = AI_PROVIDERS[roles.con].name;
  const judgeName = AI_PROVIDERS[roles.judge].name;
  const sumName = AI_PROVIDERS[roles.summary].name;

  checkAborted();
  sendWorkflowStatus(`⚔️ 正方 ${proName} 論述中...`);
  let turn = reserveProviderTurn(roles.pro);
  sendRoleAssignment(roles.pro, 'pro', '正方', turn);
  const proResponse = (await runStep(roles.pro, PROMPTS.debate.pro(text), turn)).response;

  checkAborted();
  sendWorkflowStatus(`⚔️ 反方 ${conName} 反駁中...`);
  turn = reserveProviderTurn(roles.con);
  sendRoleAssignment(roles.con, 'con', '反方', turn);
  const conResponse = (await runStep(roles.con, PROMPTS.debate.con(text, proResponse), turn)).response;

  checkAborted();
  sendWorkflowStatus(`⚔️ 判官 ${judgeName} 評析中...`);
  turn = reserveProviderTurn(roles.judge);
  sendRoleAssignment(roles.judge, 'judge', '判官', turn);
  const judgeResponse = (await runStep(roles.judge, PROMPTS.debate.judge(text, proResponse, conResponse), turn)).response;

  checkAborted();
  sendWorkflowStatus(`⚔️ ${sumName} 歸納總結中...`);
  turn = reserveProviderTurn(roles.summary);
  sendRoleAssignment(roles.summary, 'summary', '總結', turn);
  await runStep(roles.summary, PROMPTS.debate.summary(text, proResponse, conResponse, judgeResponse), turn);
  sendWorkflowStatus('');
}

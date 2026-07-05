import type { CodingRoles } from '../../../shared/types';
import { AI_PROVIDERS, PROMPTS } from '../../../shared/constants';
import { checkAborted } from '../cancel';
import { sendRoleAssignment, sendWorkflowStatus } from '../events';
import { reserveProviderTurn } from '../sendAndWait';
import { runStep } from '../stepRunner';

async function assignedStep(provider: CodingRoles[keyof CodingRoles], role: string, label: string, prompt: string): Promise<string> {
  const turn = reserveProviderTurn(provider);
  sendRoleAssignment(provider, role, label, turn);
  return (await runStep(provider, prompt, turn)).response;
}

export async function handleCodingMode(text: string, roles: CodingRoles): Promise<void> {
  const plannerName = AI_PROVIDERS[roles.planner].name;
  const reviewerName = AI_PROVIDERS[roles.reviewer].name;
  const coderName = AI_PROVIDERS[roles.coder].name;
  const testerName = AI_PROVIDERS[roles.tester].name;

  checkAborted();
  sendWorkflowStatus(`💻 Step 1/8 — ${plannerName} 撰寫規格中...`);
  const spec = await assignedStep(roles.planner, 'planner', '規劃師', PROMPTS.coding.plannerSpec(text));

  checkAborted();
  sendWorkflowStatus(`💻 Step 2/8 — ${reviewerName} 審查規格中...`);
  const specReview = await assignedStep(roles.reviewer, 'reviewer', '審查者', PROMPTS.coding.reviewerSpec(text, spec, plannerName));

  checkAborted();
  sendWorkflowStatus(`💻 Step 3/8 — ${coderName} 撰寫 v1 中...`);
  const codeV1 = await assignedStep(roles.coder, 'coder', 'Coder', PROMPTS.coding.coderV1(text, spec, plannerName, specReview, reviewerName));

  checkAborted();
  sendWorkflowStatus(`💻 Step 4/8 — ${reviewerName} Code Review 中...`);
  const codeReview = await assignedStep(roles.reviewer, 'reviewer', 'Code Review', PROMPTS.coding.reviewerCode(text, codeV1, coderName));

  checkAborted();
  sendWorkflowStatus(`💻 Step 5/8 — ${testerName} 測試分析中...`);
  const testReport = await assignedStep(roles.tester, 'tester', 'Tester', PROMPTS.coding.testerCases(text, codeV1, coderName));

  checkAborted();
  sendWorkflowStatus(`💻 Step 6/8 — ${coderName} 修正 → v2 中...`);
  const codeV2 = await assignedStep(
    roles.coder,
    'coder',
    'v2 修正',
    PROMPTS.coding.coderV2(text, codeV1, codeReview, reviewerName, testReport, testerName),
  );

  checkAborted();
  sendWorkflowStatus(`💻 Step 7/8 — ${plannerName} 驗收中...`);
  const acceptance = await assignedStep(
    roles.planner,
    'planner',
    '驗收',
    PROMPTS.coding.plannerAcceptance(text, codeV2, coderName, spec),
  );

  checkAborted();
  sendWorkflowStatus(`💻 Step 8/8 — ${coderName} 最終修正中...`);
  await assignedStep(roles.coder, 'coder', '最終版', PROMPTS.coding.coderFinal(text, codeV2, acceptance, plannerName));
  sendWorkflowStatus('');
}

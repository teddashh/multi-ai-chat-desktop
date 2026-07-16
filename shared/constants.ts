// Portions adapted from teddashh/multi-ai-chat (MIT).
// Extended for Multi-AI Chat Desktop per docs/SPEC.md v1.1.

import type { AIProvider, ChatMode, DebateRoles, ConsultRoles, CodingRoles, RoundtableRoles } from './types';

// === AI Provider Info ===

export const AI_PROVIDERS: Record<AIProvider, {
  name: string;
  url: string;
  loginUrl: string;
  color: string;
}> = {
  chatgpt: {
    name: 'ChatGPT',
    url: 'https://chatgpt.com',
    loginUrl: 'https://chatgpt.com/auth/login',
    color: '#10a37f',
  },
  claude: {
    name: 'Claude',
    url: 'https://claude.ai',
    loginUrl: 'https://claude.ai/login',
    color: '#d97706',
  },
  gemini: {
    name: 'Gemini',
    url: 'https://gemini.google.com',
    loginUrl: 'https://gemini.google.com/app',
    color: '#4285f4',
  },
  grok: {
    name: 'Grok',
    url: 'https://grok.com',
    loginUrl: 'https://grok.com',
    color: '#e11d48',
  },
};

export const DOCK_SLOT_PROVIDERS = ['chatgpt', 'claude', 'gemini', 'grok'] as const satisfies readonly AIProvider[];
export const DEFAULT_FREE_TARGET_PROVIDERS = ['chatgpt', 'claude', 'gemini', 'grok'] as const satisfies readonly AIProvider[];

// === Mode Definitions ===

export const CHAT_MODES: Record<ChatMode, {
  name: string;
  description: string;
  icon: string;
  serial: boolean; // true = 串行, false = 平行
}> = {
  free: {
    name: '自由模式',
    description: '同時發給四家，各自獨立回答',
    icon: '⚡',
    serial: false,
  },
  debate: {
    name: '四方辯證',
    description: '正方 → 反方 → 判官 → 總結',
    icon: '⚔️',
    serial: true,
  },
  consult: {
    name: '多方諮詢',
    description: '雙源先答 → 審查補充 → 總結研究',
    icon: '🔍',
    serial: true,
  },
  coding: {
    name: 'Coding 模式',
    description: '規劃 → 審查 → 實作 → 測試 → 驗收（8 步）',
    icon: '💻',
    serial: true,
  },
  roundtable: {
    name: '道理辯證',
    description: '5 輪辯證螺旋 × 4 人，真理越辯越明',
    icon: '🔄',
    serial: true,
  },
};

// === Default Role Assignments ===

export const DEFAULT_DEBATE_ROLES: DebateRoles = {
  pro: 'chatgpt',
  con: 'claude',
  judge: 'grok',
  summary: 'gemini',
};

export const DEFAULT_CONSULT_ROLES: ConsultRoles = {
  first: 'chatgpt',
  second: 'grok',
  reviewer: 'claude',
  summary: 'gemini',
};

export const DEFAULT_CODING_ROLES: CodingRoles = {
  planner: 'gemini',
  reviewer: 'chatgpt',
  coder: 'claude',
  tester: 'grok',
};

export const DEFAULT_ROUNDTABLE_ROLES: RoundtableRoles = {
  first: 'claude',
  second: 'gemini',
  third: 'grok',
  fourth: 'chatgpt',
};

const BRAINSTORM_LENSES: Record<AIProvider, string> = {
  chatgpt: 'practical user value, executable options, and a clear path from idea to action',
  claude: 'systems thinking, human impact, hidden constraints, and long-term consequences',
  gemini: 'cross-domain connections, visual or multimodal possibilities, and unexpected combinations',
  grok: 'contrarian angles, bold experiments, overlooked edge cases, and non-obvious opportunities',
};

// === Prompt Templates for Serial Modes ===

export const PROMPTS = {
  brainstorm: {
    buildPrompt: (question: string, provider: AIProvider) =>
      [
        `You are ${AI_PROVIDERS[provider].name}, one of four independent collaborators in a brainstorming sprint.`,
        `Your assigned lens is: ${BRAINSTORM_LENSES[provider]}.`,
        'Work from the original request below. If details are missing, state a reasonable assumption and proceed instead of asking the user to choose among options.',
        '1. Reframe the opportunity in one sentence.',
        '2. Generate 6-10 concrete ideas with meaningful variety, not cosmetic variations.',
        '3. Mark at least two bold or unconventional ideas.',
        '4. Recommend the strongest three ideas and give each one a practical next step.',
        "Use the user's requested language. Avoid generic filler, do not imitate the other collaborators, and do not mention this internal collaboration brief.",
        `Original request:\n\n${question}`,
      ].join('\n\n'),
  },
  debate: {
    pro: (question: string) =>
      `請從支持、贊同的角度回答以下問題，提出你最強的論點：\n\n${question}`,
    con: (question: string, proResponse: string) =>
      `使用者問了：「${question}」\n\n正方提出了以下觀點：\n${proResponse}\n\n請從反方的角度，針對以上正方觀點提出反駁，指出其論點的弱點和盲點。`,
    judge: (question: string, proResponse: string, conResponse: string) =>
      `使用者問了：「${question}」\n\n正方觀點：\n${proResponse}\n\n反方觀點：\n${conResponse}\n\n你是判官。請不要選邊站，而是：\n1. 分別評論正反兩方論點的邏輯強度與弱點\n2. 指出雙方論述中被忽略的盲點或隱含假設\n3. 列出哪些爭議是真分歧、哪些只是語義或角度差異\n4. 給出這場辯論目前的焦點在哪\n\n你的工作不是下結論，而是把論點的結構梳理清楚，讓後面的總結方能站在更高的視角收斂。`,
    summary: (question: string, proResponse: string, conResponse: string, judgeResponse: string) =>
      `使用者問了：「${question}」\n\n正方觀點：\n${proResponse}\n\n反方觀點：\n${conResponse}\n\n判官評論：\n${judgeResponse}\n\n請綜合正反雙方的論點與判官的評析，指出各自的優缺點，並補上你自己的觀點和結論。`,
  },
  consult: {
    first: (question: string) => question,
    second: (question: string) => question,
    reviewer: (
      question: string,
      firstResponse: string,
      firstName: string,
      secondResponse: string,
      secondName: string,
    ) =>
      `使用者問了：「${question}」\n\n${firstName} 的回答：\n${firstResponse}\n\n${secondName} 的回答：\n${secondResponse}\n\n請檢查兩人說的對不對，對比他們的差異，指出誰的觀點更完整，有沒有遺漏或錯誤。也請你做些研究，補上你自己的答案。`,
    summary: (
      question: string,
      firstResponse: string,
      firstName: string,
      secondResponse: string,
      secondName: string,
      reviewerResponse: string,
      reviewerName: string,
    ) =>
      `使用者問了：「${question}」\n\n${firstName} 的回答：\n${firstResponse}\n\n${secondName} 的回答：\n${secondResponse}\n\n${reviewerName} 的審查：\n${reviewerResponse}\n\n請綜合以上三位的回答，找出共識與分歧，總結他們的說法，並做點研究補上你自己的最終答案。`,
  },
  roundtable: {
    /**
     * 辯證螺旋 (Dialectical Spiral) — 5 輪 × 4 人
     *
     * 溫度曲線：
     *   Round 1: 開場立論（中度發散 — 各自表態，選一個獨特角度）
     *   Round 2: 交叉質疑（高度發散 — 攻擊弱點，但承認好的部分）
     *   Round 3: 攻防深化（中高度 — 回應質疑，修正被說服的點）
     *   Round 4: 核心收斂（中度收斂 — 區分真分歧 vs 假分歧）
     *   Round 5: 真理浮現（高度收斂 — 最終結論，坦承立場變化）
     */
    buildPrompt: (
      question: string,
      round: number,
      speakerName: string,
      history: { name: string; round: number; text: string }[]
    ): string => {
      const roundInstructions: Record<number, string> = {
        1: `你是 ${speakerName}。這是一場五輪辯證，四位 AI 輪流發言，目標是「真理越辯越明」。\n\n【第一輪・開場立論】\n請針對以下議題，提出你獨特的觀點和立場。選一個你最有信心的角度深入闘述，不要試圖面面俱到。\n\n要求：有明確立場、有具體論據、有邏輯推演。請精煉你的論點（建議 300-500 字）。`,

        2: `你是 ${speakerName}。\n\n【第二輪・交叉質疑】\n請仔細讀完其他人第一輪的論點，然後：\n1. 指出你認為最有問題的 1-2 個論點，具體說明為什麼不同意\n2. 承認哪些點你覺得說得有道理（不能跳過這步）\n3. 提出一個其他人都沒提到的新角度\n\n不要全盤否定，也不要和稀泥。要有建設性的衝突。`,

        3: `你是 ${speakerName}。\n\n【第三輪・攻防深化】\n你的論點在第二輪被質疑了。請：\n1. 針對被質疑的部分做出具體回應（不能迴避）\n2. 如果你被說服了某些點，坦承修正你的立場 — 改變想法不是弱點，是思考能力的展現\n3. 在修正後的基礎上，深化你最核心的論點\n\n目標：讓你的論點更精準、更有力。`,

        4: `你是 ${speakerName}。\n\n【第四輪・核心收斂】\n經過三輪辯論，請做一次結構性的梳理：\n1. 列出目前四方的共識（哪些點大家其實是同意的？）\n2. 列出真正的核心分歧（哪些是根本性的不同意見？）\n3. 辨別假分歧（哪些爭論其實只是語義差異或角度不同？）\n4. 對核心分歧，說明你為什麼堅持你的立場 — 不要為了和諧而放棄你認為對的事\n\n目標：把辯論聚焦到真正重要的問題上。`,

        5: `你是 ${speakerName}。\n\n【最終輪・真理浮現】\n這是最後一輪。請給出你的最終結論：\n1. 經過四輪辯論，你的立場改變了多少？具體哪些觀點改變了你的想法？\n2. 你認為這個議題的「真理」在哪裡？（可以是多元的）\n3. 還有哪些問題是這場辯論沒能解決的？\n\n坦誠 > 正確。展現你的思考過程。`,
      };

      let prompt = `${roundInstructions[round]}\n\n議題：「${question}」`;

      if (history.length > 0) {
        const historyText = history
          .map((h) => `【第${h.round}輪・${h.name}】\n${h.text}`)
          .join('\n\n---\n\n');
        prompt += `\n\n── 以下是目前的辯論記錄 ──\n\n${historyText}`;
      }

      return prompt;
    },
  },
  coding: {
    // Step 1: Planner writes spec
    plannerSpec: (question: string) =>
      `你是軟體架構規劃師。請針對以下需求，寫出完整的實作計畫：\n1. 需求分析與邊界條件\n2. 技術選型與理由\n3. 檔案結構\n4. 每個模組的職責與介面定義\n5. 關鍵演算法的偽代碼\n6. 可能的 edge cases\n\n計畫要完整到「不需要再問問題就能直接寫 code」。\n\n需求：${question}`,

    // Step 2: Reviewer reviews spec
    reviewerSpec: (question: string, spec: string, plannerName: string) =>
      `你是嚴格的技術審查者。${plannerName} 針對以下需求寫了一份實作計畫：\n\n需求：${question}\n\n計畫：\n${spec}\n\n請嚴格審查：\n1. 邏輯漏洞？\n2. 漏掉的 edge cases？\n3. 安全性問題？\n4. 架構設計是否合理？\n5. 有沒有更好的做法？\n\n不要當好人，你的工作就是挑毛病。同時也指出計畫中做得好的部分。`,

    // Step 3: Coder writes v1
    coderV1: (question: string, spec: string, plannerName: string, specReview: string, reviewerName: string) =>
      `你是資深工程師。請根據以下規格和審查意見，寫出第一版完整實作代碼。\n\n需求：${question}\n\n${plannerName} 的規格：\n${spec}\n\n${reviewerName} 的審查意見：\n${specReview}\n\n要求：\n1. 處理審查中提到的所有問題\n2. 補上錯誤處理和 edge cases\n3. 如果規格和審查有矛盾，用你的專業判斷選擇\n\n這是第一版，後面還有 code review 和測試機會，所以先完成核心功能。`,

    // Step 4: Reviewer reviews code
    reviewerCode: (question: string, code: string, coderName: string) =>
      `你是嚴格的 Code Reviewer。${coderName} 根據規格寫了第一版代碼。\n\n原始需求：${question}\n\n${coderName} 的代碼（v1）：\n${code}\n\n請做完整的 code review：\n1. 有沒有 bug 或邏輯錯誤？\n2. 有沒有漏掉的 edge cases？\n3. 程式碼品質：命名、結構、可讀性\n4. 效能問題？\n5. 安全性問題？\n\n列出每個問題的嚴重程度（Critical / Major / Minor）和具體修正建議。`,

    // Step 5: Tester writes test cases + hunts bugs
    testerCases: (question: string, code: string, coderName: string) =>
      `你是嚴格的測試工程師（QA）。${coderName} 寫了第一版代碼，請你從測試視角挑問題。\n\n原始需求：${question}\n\n${coderName} 的代碼（v1）：\n${code}\n\n請：\n1. 列出關鍵的測試案例（正常路徑、邊界條件、異常輸入、併發/狀態問題）\n2. 推演每個測試案例在這份 code 上會不會 pass，如果會失敗，具體說明為什麼\n3. 找出 code review 視角不容易看出、但跑測試才會爆的 bug（race condition、資源洩漏、邊界溢位等）\n4. 如果適用，給出可直接使用的測試 code（unit test 或 integration test）\n\n目標：用測試的角度補強 code review 漏掉的問題。`,

    // Step 6: Coder fixes → v2 (based on review + tests)
    coderV2: (
      question: string,
      codeV1: string,
      codeReview: string,
      reviewerName: string,
      testReport: string,
      testerName: string,
    ) =>
      `你是資深工程師。${reviewerName} 做了 code review，${testerName} 做了測試分析。\n\n原始需求：${question}\n\n你的 v1 代碼：\n${codeV1}\n\n${reviewerName} 的 code review：\n${codeReview}\n\n${testerName} 的測試報告：\n${testReport}\n\n請根據 review 與測試發現的問題修正代碼，產出 v2。要求：\n1. 處理所有 Critical 和 Major 問題\n2. 確保代碼能通過 Tester 列出的所有測試案例\n3. 在關鍵修改處加上簡短註解說明為什麼改\n4. 如果你不同意某個 review 或測試意見，說明理由\n\n輸出完整的 v2 代碼。`,

    // Step 7: Planner does acceptance
    plannerAcceptance: (question: string, codeV2: string, coderName: string, originalSpec: string) =>
      `你是軟體架構規劃師，同時也是這個需求的提出者。${coderName} 已經根據規格、code review 和測試報告修正了代碼。\n\n原始需求：${question}\n\n你當初的規格：\n${originalSpec}\n\n${coderName} 的 v2 代碼：\n${codeV2}\n\n請做驗收測試：\n1. v2 是否完整實現了原始需求的每一個功能點？\n2. 是否符合你的架構設計？\n3. 有沒有偏離規格的地方？\n4. 還有什麼需要調整的？\n\n如果都通過，明確說「驗收通過」。如果有問題，列出需要修正的項目。`,

    // Step 8: Coder final fix
    coderFinal: (question: string, codeV2: string, acceptance: string, plannerName: string) =>
      `你是資深工程師。${plannerName} 對你的 v2 代碼做了驗收測試。\n\n原始需求：${question}\n\n你的 v2 代碼：\n${codeV2}\n\n${plannerName} 的驗收結果：\n${acceptance}\n\n如果驗收通過，輸出最終版代碼（可做最後的 polish）。\n如果有需要修正的項目，處理後輸出最終版。\n\n這是最終版，請確保：\n1. 所有驗收意見已處理\n2. 代碼可以直接使用\n3. 必要的文件或使用說明已包含`,
  },
};

export const SSO_ALLOWLIST_HOSTS = [
  'accounts.google.com',
  'accounts.youtube.com',
  'appleid.apple.com',
  'login.microsoftonline.com',
  'login.live.com',
  'github.com',
] as const;

export const PULL_MAX_DECODED_BYTES = 1_048_576;
export const OUTBOX_MAX_BYTES = 10_485_760;
export const POLL_PULL_MS = 500;

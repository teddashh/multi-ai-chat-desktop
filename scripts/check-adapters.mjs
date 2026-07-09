import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterDir = path.join(root, 'adapters');
const schema = JSON.parse(await readFile(path.join(adapterDir, 'schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false, validateFormats: false });
const validate = ajv.compile(schema);

const expected = {
  chatgpt: {
    adapterVersion: 3,
    urls: {
      app: 'https://chatgpt.com',
      login: 'https://chatgpt.com/auth/login',
      match: ['chatgpt.com/*', 'chat.openai.com/*'],
      ssoMatch: ['auth.openai.com/*', 'auth0.openai.com/*', 'gsi.google.com/*', 'https://www.google.com/accounts', 'accounts.google.com.tw/*'],
    },
    inputStrategy: 'default',
    doneDelayMs: 3000,
    chunkDebounceMs: 800,
    inputSelectors: ['#prompt-textarea', '[id="prompt-textarea"]', 'div[contenteditable="true"][data-placeholder]'],
    sendButtonSelectors: ['[data-testid="send-button"]', 'button[aria-label="Send prompt"]', 'button[aria-label="Send"]'],
    responseSelectors: ['[data-message-author-role="assistant"] .markdown'],
    loginDetectors: ['#prompt-textarea', '[data-testid="send-button"]'],
    thinkingDetectors: ['[data-testid="stop-button"]', 'button[aria-label="Stop generating"]', 'button[aria-label="Stop streaming"]', 'button[aria-label="Stop"]'],
    stopButtonSelectors: ['[data-testid="stop-button"]', 'button[aria-label="Stop generating"]', 'button[aria-label="Stop streaming"]', 'button[aria-label="Stop"]'],
  },
  claude: {
    adapterVersion: 3,
    urls: {
      app: 'https://claude.ai',
      login: 'https://claude.ai/login',
      match: ['claude.ai/*'],
      ssoMatch: ['auth.anthropic.com/*', 'gsi.google.com/*', 'https://www.google.com/accounts', 'accounts.google.com.tw/*'],
    },
    inputStrategy: 'prosemirror-paste',
    doneDelayMs: 5000,
    chunkDebounceMs: 500,
    inputSelectors: ['.ProseMirror[contenteditable="true"]', '[contenteditable="true"].ProseMirror', 'div.ProseMirror', 'fieldset div[contenteditable="true"]'],
    sendButtonSelectors: ['button[aria-label="Send Message"]', 'button[aria-label="Send message"]', 'button[aria-label="Send"]', 'fieldset button[type="button"]:last-of-type'],
    responseSelectors: ['.font-claude-response', '[data-is-streaming] .font-claude-response', '.font-claude-message'],
    loginDetectors: ['.ProseMirror[contenteditable="true"]', '[contenteditable="true"].ProseMirror'],
    thinkingDetectors: ['[data-is-streaming="true"]', 'button[aria-label="Stop Response"]', 'button[aria-label="Stop response"]', 'button[aria-label="Stop"]'],
    stopButtonSelectors: ['button[aria-label="Stop Response"]', 'button[aria-label="Stop response"]', 'button[aria-label="Stop"]'],
  },
  gemini: {
    adapterVersion: 1,
    urls: {
      app: 'https://gemini.google.com/app',
      login: 'https://gemini.google.com/app',
      match: ['gemini.google.com/*'],
      ssoMatch: [],
    },
    inputStrategy: 'quill-angular',
    doneDelayMs: 4000,
    chunkDebounceMs: 600,
    inputSelectors: ['.ql-editor[contenteditable="true"]', 'rich-textarea .ql-editor', 'div[contenteditable="true"][aria-label="Enter a prompt here"]', 'div[contenteditable="true"][aria-label]', '.input-area [contenteditable="true"]', 'rich-textarea [contenteditable="true"]'],
    sendButtonSelectors: ['button.send-button', 'button[aria-label="Send message"]', 'button[aria-label="Send"]', 'button[aria-label="傳送訊息"]', 'button[aria-label="送出"]', 'button[data-mat-icon-name="send"]', '.send-button-container button', 'button mat-icon[data-mat-icon-name="send"]', '.action-wrapper button[aria-label]', '.input-area-container button.send', 'button.send-message-button'],
    responseSelectors: ['.model-response-text .markdown', '.model-response-text', 'model-response .markdown', 'model-response message-content', '.response-content .markdown', '.message-content[data-message-id]'],
    loginDetectors: ['.ql-editor[contenteditable="true"]', 'rich-textarea [contenteditable="true"]', 'div[contenteditable="true"][aria-label="Enter a prompt here"]'],
    thinkingDetectors: ['.loading-indicator', '.thinking-indicator', 'mat-progress-bar', 'button[aria-label="Stop response"]', 'button[aria-label="Stop"]', 'button[aria-label="停止回應"]', '.response-streaming', '[data-test-id="response-loading"]'],
    stopButtonSelectors: ['button[aria-label="Stop response"]', 'button[aria-label="Stop"]', 'button[aria-label="停止回應"]'],
  },
  grok: {
    adapterVersion: 6,
    urls: {
      app: 'https://grok.com',
      login: 'https://grok.com',
      match: ['grok.com/*'],
      ssoMatch: ['x.com/*', 'twitter.com/*', 'accounts.x.ai/*', 'auth.grokusercontent.com/*', 'auth.grok.com/*', 'challenges.cloudflare.com/*', 'accounts.google.com.tw/*', 'auth.grokipedia.com/*', 'gsi.google.com/*', 'https://www.google.com/accounts'],
    },
    inputStrategy: 'prosemirror-paste',
    doneDelayMs: 8000,
    chunkDebounceMs: 600,
    inputSelectors: ['[data-testid="chat-input"] .ProseMirror[contenteditable="true"]', '[data-testid="chat-input"] [contenteditable="true"]', '.ProseMirror[contenteditable="true"]', '[contenteditable="true"].ProseMirror', 'div.ProseMirror[contenteditable="true"]'],
    sendButtonSelectors: ['button[data-testid="chat-submit"]', 'button[aria-label="Submit"]', 'form button[type="submit"]', 'button[type="submit"]'],
    responseSelectors: ['[data-testid="assistant-message"] .response-content-markdown', '[data-testid="assistant-message"]', '.response-content-markdown', '.message-bubble.assistant'],
    loginDetectors: ['[data-testid="chat-input"] .ProseMirror[contenteditable="true"]', '.ProseMirror[contenteditable="true"]', '[data-testid="chat-submit"]'],
    thinkingDetectors: ['button[data-testid="chat-stop"]', 'button[aria-label="Stop"]', 'button[aria-label="Stop generating"]', 'button[aria-label="Stop response"]', '[data-streaming="true"]', { selector: '.thinking-container', textIncludes: 'Thinking', textExcludes: 'Thought for' }],
    stopButtonSelectors: ['button[data-testid="chat-stop"]', 'button[aria-label="Stop"]', 'button[aria-label="Stop generating"]', 'button[aria-label="Stop response"]'],
  },
};

const assertEqual = (actual, expectedValue, label) => {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expectedValue);
  if (actualJson !== expectedJson) {
    throw new Error(`${label} mismatch\nactual:   ${actualJson}\nexpected: ${expectedJson}`);
  }
};

for (const provider of Object.keys(expected)) {
  const adapter = JSON.parse(await readFile(path.join(adapterDir, `${provider}.json`), 'utf8'));
  if (!validate(adapter)) {
    throw new Error(`${provider}.json schema errors: ${JSON.stringify(validate.errors, null, 2)}`);
  }

  const spec = expected[provider];
  assertEqual(adapter.provider, provider, `${provider}.provider`);
  assertEqual(adapter.adapterVersion, spec.adapterVersion, `${provider}.adapterVersion`);
  assertEqual(adapter.urls, spec.urls, `${provider}.urls`);
  assertEqual(adapter.inputStrategy, spec.inputStrategy, `${provider}.inputStrategy`);
  assertEqual(adapter.sendStrategy, 'click', `${provider}.sendStrategy`);
  assertEqual(adapter.timing.doneDelayMs, spec.doneDelayMs, `${provider}.doneDelayMs`);
  assertEqual(adapter.timing.chunkDebounceMs, spec.chunkDebounceMs, `${provider}.chunkDebounceMs`);
  assertEqual(adapter.inputSelectors, spec.inputSelectors, `${provider}.inputSelectors`);
  assertEqual(adapter.sendButtonSelectors, spec.sendButtonSelectors, `${provider}.sendButtonSelectors`);
  assertEqual(adapter.responseSelectors, spec.responseSelectors, `${provider}.responseSelectors`);
  assertEqual(adapter.loginDetectors, spec.loginDetectors, `${provider}.loginDetectors`);
  assertEqual(adapter.thinkingDetectors, spec.thinkingDetectors, `${provider}.thinkingDetectors`);
  assertEqual(adapter.stopButtonSelectors, spec.stopButtonSelectors, `${provider}.stopButtonSelectors`);
}

const claudeCodeExpected = {
  adapterVersion: 3,
  urls: {
    app: 'https://claude.ai/code',
    login: 'https://claude.ai/login',
    match: ['https://claude.ai/code'],
    ssoMatch: ['auth.anthropic.com/*', 'gsi.google.com/*', 'https://www.google.com/accounts', 'https://claude.ai/oauth', 'accounts.google.com.tw/*'],
  },
  inputStrategy: 'prosemirror-paste',
  doneDelayMs: 5000,
  chunkDebounceMs: 500,
  inputSelectors: [
    '.ProseMirror[contenteditable="true"]',
    '[contenteditable="true"].ProseMirror',
    'div.ProseMirror',
    'fieldset div[contenteditable="true"]',
  ],
  sendButtonSelectors: [
    'button[aria-label="Send Message"]',
    'button[aria-label="Send message"]',
    'button[aria-label="Send"]',
    'fieldset button[type="button"]:last-of-type',
  ],
  responseSelectors: [
    '.font-claude-response',
    '[data-is-streaming] .font-claude-response',
    '.font-claude-message',
  ],
  loginDetectors: ['.ProseMirror[contenteditable="true"]', '[contenteditable="true"].ProseMirror'],
  loggedOutDetectors: [],
  thinkingDetectors: [
    '[data-is-streaming="true"]',
    'button[aria-label="Stop Response"]',
    'button[aria-label="Stop response"]',
    'button[aria-label="Stop"]',
  ],
  stopButtonSelectors: [
    'button[aria-label="Stop Response"]',
    'button[aria-label="Stop response"]',
    'button[aria-label="Stop"]',
  ],
};

const claudeCode = JSON.parse(await readFile(path.join(adapterDir, 'claude-code.json'), 'utf8'));
if (!validate(claudeCode)) {
  throw new Error(`claude-code.json schema errors: ${JSON.stringify(validate.errors, null, 2)}`);
}
assertEqual(claudeCode.provider, 'claude-code', 'claude-code.provider');
assertEqual(claudeCode.displayName, 'Claude Code', 'claude-code.displayName');
assertEqual(claudeCode.adapterVersion, claudeCodeExpected.adapterVersion, 'claude-code.adapterVersion');
assertEqual(claudeCode.urls, claudeCodeExpected.urls, 'claude-code.urls');
assertEqual(claudeCode.inputStrategy, claudeCodeExpected.inputStrategy, 'claude-code.inputStrategy');
assertEqual(claudeCode.sendStrategy, 'click', 'claude-code.sendStrategy');
assertEqual(claudeCode.timing.doneDelayMs, claudeCodeExpected.doneDelayMs, 'claude-code.doneDelayMs');
assertEqual(claudeCode.timing.chunkDebounceMs, claudeCodeExpected.chunkDebounceMs, 'claude-code.chunkDebounceMs');
assertEqual(claudeCode.timing.statusIntervalMs, 10000, 'claude-code.statusIntervalMs');
assertEqual(claudeCode.timing.backupPollMs, 3000, 'claude-code.backupPollMs');
assertEqual(claudeCode.inputSelectors, claudeCodeExpected.inputSelectors, 'claude-code.inputSelectors');
assertEqual(claudeCode.sendButtonSelectors, claudeCodeExpected.sendButtonSelectors, 'claude-code.sendButtonSelectors');
assertEqual(claudeCode.responseSelectors, claudeCodeExpected.responseSelectors, 'claude-code.responseSelectors');
assertEqual(claudeCode.loginDetectors, claudeCodeExpected.loginDetectors, 'claude-code.loginDetectors');
assertEqual(claudeCode.loggedOutDetectors, claudeCodeExpected.loggedOutDetectors, 'claude-code.loggedOutDetectors');
assertEqual(claudeCode.thinkingDetectors, claudeCodeExpected.thinkingDetectors, 'claude-code.thinkingDetectors');
assertEqual(claudeCode.stopButtonSelectors, claudeCodeExpected.stopButtonSelectors, 'claude-code.stopButtonSelectors');

console.log('Adapter schema and SPEC section 5.1 seed checks passed.');

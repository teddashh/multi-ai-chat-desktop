// Portions adapted from teddashh/multi-ai-chat (MIT).
// Extended for Multi-AI Chat Desktop per docs/SPEC.md v1.1.

export type AIProvider = 'chatgpt' | 'claude' | 'gemini' | 'grok';

export interface AIConnection {
  provider: AIProvider;
  status: 'connected' | 'disconnected' | 'checking';
  tabId?: number;
}

export type ChatMode = 'free' | 'debate' | 'consult' | 'coding' | 'roundtable';

export interface DebateRoles {
  pro: AIProvider;
  con: AIProvider;
  judge: AIProvider;
  summary: AIProvider;
}

export interface ConsultRoles {
  first: AIProvider;
  second: AIProvider;
  reviewer: AIProvider;
  summary: AIProvider;
}

export interface CodingRoles {
  planner: AIProvider;
  reviewer: AIProvider;
  coder: AIProvider;
  tester: AIProvider;
}

export interface RoundtableRoles {
  first: AIProvider;
  second: AIProvider;
  third: AIProvider;
  fourth: AIProvider;
}

export type ModeRoles = DebateRoles | ConsultRoles | CodingRoles | RoundtableRoles;

export interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  provider?: AIProvider;
  modeRole?: string;
  content: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  mode: ChatMode;
  roles?: ModeRoles;
  messages: ChatMessage[];
  createdAt: number;
}

export interface ProviderState {
  provider: AIProvider;
  webview: 'none' | 'creating' | 'loaded';
  dom: 'unknown' | 'ready';
  login: 'unknown' | 'logged_in' | 'logged_out' | 'blocked';
  thinking: boolean;
  lastStatusAt: number;
  bridge?: 'ok' | 'degraded';
  bridgeReason?: string;
  adapter?: 'ok' | 'broken';
}

export type MessageAction =
  | 'CHECK_STATUS'
  | 'STATUS_REPORT'
  | 'SEND_MESSAGE'
  | 'RESPONSE_CHUNK'
  | 'RESPONSE_DONE'
  | 'OPEN_LOGIN'
  | 'GET_CONNECTIONS'
  | 'CONNECTIONS_UPDATE'
  | 'WORKFLOW_STATUS'
  | 'ROLE_ASSIGNMENT'
  | 'CANCEL_WORKFLOW'
  | 'PUBLISH_HACKMD'
  | 'ADAPTER_UPDATE'
  | 'REPORT_BROKEN';

export interface BridgeMessage {
  v: 1;
  action: MessageAction;
  provider?: AIProvider;
  payload?: unknown;
  transport?: 'title' | 'pull' | 'local';
  bootId?: string;
  seq?: number;
  mid?: number;
}

export type ExtensionMessage = Omit<BridgeMessage, 'v' | 'bootId' | 'seq' | 'mid'>;

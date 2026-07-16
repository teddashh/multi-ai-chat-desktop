import type { ChatMode, WorkflowPresetId } from '../../shared/types';
import { createUniqueSuffix } from './uniqueId';

export const CONVERSATION_SESSIONS_STORAGE_KEY = 'multi-ai-chat:conversation-sessions:v1';
export const MAX_CONVERSATION_SESSIONS = 30;
export const MAX_CONVERSATION_SESSION_TITLE_LENGTH = 48;
export const DEFAULT_CONVERSATION_SESSION_TITLE = 'New conversation';

const CHAT_MODES = new Set<ChatMode>(['free', 'debate', 'consult', 'coding', 'roundtable']);

export interface ConversationSessionMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  provider?: string;
  authorLabel?: string;
  modeRole?: string;
  final?: boolean;
  truncated?: boolean;
}

export interface ConversationSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  mode: ChatMode;
  presetId?: WorkflowPresetId;
  messages: ConversationSessionMessage[];
}

export interface ConversationSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ConversationSessionSaveResult {
  saved: boolean;
  sessions: ConversationSession[];
  evictedSessionIds: string[];
  reason?: 'quota' | 'write-error' | 'storage-unavailable';
}

export interface CreateConversationSessionInput {
  id?: string;
  title?: string;
  mode?: ChatMode;
  presetId?: WorkflowPresetId;
  messages?: readonly ConversationSessionMessage[];
  now?: number;
}

export interface BeginNewConversationSessionInput {
  sessions: readonly ConversationSession[];
  activeSessionId: string;
  messages: readonly ConversationSessionMessage[];
  mode: ChatMode;
  presetId?: WorkflowPresetId;
  now?: number;
}

export interface BeginNewConversationSessionResult {
  sessions: ConversationSession[];
  active: ConversationSession;
}

export function createConversationSession({
  id,
  title,
  mode = 'free',
  presetId,
  messages = [],
  now = Date.now(),
}: CreateConversationSessionInput = {}): ConversationSession {
  const timestamp = normalizeTimestamp(now) ?? Date.now();
  const normalizedMessages = normalizeConversationMessages(messages);

  const normalizedMode = isChatMode(mode) ? mode : 'free';
  const normalizedPresetId = normalizePresetId(presetId, normalizedMode);

  return {
    id: nonEmptyString(id) ?? createSessionId(timestamp),
    title: normalizeSessionTitle(title, normalizedMessages),
    createdAt: timestamp,
    updatedAt: timestamp,
    mode: normalizedMode,
    ...(normalizedPresetId ? { presetId: normalizedPresetId } : {}),
    messages: normalizedMessages,
  };
}

export function beginNewConversationSession({
  sessions,
  activeSessionId,
  messages,
  mode,
  presetId,
  now = Date.now(),
}: BeginNewConversationSessionInput): BeginNewConversationSessionResult {
  const timestamp = normalizeTimestamp(now) ?? Date.now();
  const normalizedSessions = normalizeConversationSessions(sessions);
  const normalizedMessages = normalizeConversationMessages(messages);
  const existing = normalizedSessions.find((session) => session.id === activeSessionId);

  if (normalizedMessages.length === 0) {
    const active = existing
      ? {
          id: existing.id,
          title: DEFAULT_CONVERSATION_SESSION_TITLE,
          createdAt: existing.createdAt,
          updatedAt: Math.max(existing.createdAt, timestamp),
          mode: 'free' as const,
          messages: [],
        }
      : createConversationSession({ now: timestamp });
    return { sessions: upsertConversationSession(normalizedSessions, active), active };
  }

  const normalizedPresetId = normalizePresetId(presetId, mode);
  const base = existing ?? createConversationSession({ id: activeSessionId, now: timestamp });
  let archived = normalizedSessions;
  if (sessionContentChanged(base, normalizedMessages, mode, normalizedPresetId)) {
    const archivedSession: ConversationSession = {
      ...base,
      title: titleFromFirstUserMessage(normalizedMessages),
      updatedAt: timestamp,
      mode,
      messages: normalizedMessages,
    };
    if (normalizedPresetId) archivedSession.presetId = normalizedPresetId;
    else delete archivedSession.presetId;
    archived = upsertConversationSession(normalizedSessions, archivedSession);
  }
  const active = createConversationSession({ now: timestamp });
  return { sessions: upsertConversationSession(archived, active), active };
}

export function titleFromFirstUserMessage(messages: unknown): string {
  if (!Array.isArray(messages)) return DEFAULT_CONVERSATION_SESSION_TITLE;
  const firstUserMessage = messages.find(
    (message): message is Record<string, unknown> => isRecord(message) && message.role === 'user',
  );
  if (!firstUserMessage || typeof firstUserMessage.content !== 'string') {
    return DEFAULT_CONVERSATION_SESSION_TITLE;
  }

  return shortTitle(firstUserMessage.content) ?? DEFAULT_CONVERSATION_SESSION_TITLE;
}

export function normalizeConversationSessionMessage(value: unknown): ConversationSessionMessage | undefined {
  if (!isRecord(value)) return undefined;
  const id = nonEmptyString(value.id);
  if (!id || (value.role !== 'user' && value.role !== 'ai') || typeof value.content !== 'string') {
    return undefined;
  }

  const message: ConversationSessionMessage = {
    id,
    role: value.role,
    content: value.content,
  };
  const provider = nonEmptyString(value.provider);
  const authorLabel = nonEmptyString(value.authorLabel);
  const modeRole = nonEmptyString(value.modeRole);
  if (provider) message.provider = provider;
  if (authorLabel) message.authorLabel = authorLabel;
  if (modeRole) message.modeRole = modeRole;
  if (typeof value.final === 'boolean') message.final = value.final;
  if (typeof value.truncated === 'boolean') message.truncated = value.truncated;
  return message;
}

export function normalizeConversationSession(value: unknown): ConversationSession | undefined {
  if (!isRecord(value)) return undefined;
  const id = nonEmptyString(value.id);
  if (!id) return undefined;

  const messages = normalizeConversationMessages(value.messages);
  const createdAt = normalizeTimestamp(value.createdAt) ?? normalizeTimestamp(value.updatedAt) ?? 0;
  const updatedAt = Math.max(createdAt, normalizeTimestamp(value.updatedAt) ?? createdAt);

  const mode = isChatMode(value.mode) ? value.mode : 'free';
  const presetId = normalizePresetId(value.presetId, mode);

  return {
    id,
    title: normalizeSessionTitle(value.title, messages),
    createdAt,
    updatedAt,
    mode,
    ...(presetId ? { presetId } : {}),
    messages,
  };
}

export function normalizeConversationSessions(value: unknown): ConversationSession[] {
  if (!Array.isArray(value)) return [];

  const sessionsById = new Map<string, ConversationSession>();
  for (const candidate of value) {
    const session = normalizeConversationSession(candidate);
    if (!session) continue;
    const current = sessionsById.get(session.id);
    if (!current || isMoreRecent(session, current)) sessionsById.set(session.id, session);
  }

  return Array.from(sessionsById.values())
    .sort(compareMostRecentFirst)
    .slice(0, MAX_CONVERSATION_SESSIONS);
}

export function sessionContentChanged(
  existing: Pick<ConversationSession, 'mode' | 'presetId' | 'messages'>,
  messages: readonly ConversationSessionMessage[],
  mode: ChatMode,
  presetId?: WorkflowPresetId,
): boolean {
  if (
    existing.mode !== mode ||
    existing.presetId !== normalizePresetId(presetId, mode) ||
    existing.messages.length !== messages.length
  ) {
    return true;
  }
  return existing.messages.some((message, index) => !conversationMessageEquals(message, messages[index]));
}

function conversationMessageEquals(left: ConversationSessionMessage, right: ConversationSessionMessage): boolean {
  return (
    left.id === right.id &&
    left.role === right.role &&
    left.content === right.content &&
    left.provider === right.provider &&
    left.authorLabel === right.authorLabel &&
    left.modeRole === right.modeRole &&
    left.final === right.final &&
    left.truncated === right.truncated
  );
}

export function upsertConversationSession(
  sessions: readonly ConversationSession[],
  session: ConversationSession,
): ConversationSession[] {
  const normalizedSessions = normalizeConversationSessions(sessions);
  const normalizedSession = normalizeConversationSession(session);
  if (!normalizedSession) return normalizedSessions;

  return normalizeConversationSessions([
    normalizedSession,
    ...normalizedSessions.filter((candidate) => candidate.id !== normalizedSession.id),
  ]);
}

export function removeConversationSession(
  sessions: readonly ConversationSession[],
  sessionId: string,
): ConversationSession[] {
  return normalizeConversationSessions(sessions.filter((session) => session.id !== sessionId));
}

export function loadConversationSessions(storage?: ConversationSessionStorage): ConversationSession[] {
  const target = storage ?? defaultStorage();
  if (!target) return [];

  try {
    const stored = target.getItem(CONVERSATION_SESSIONS_STORAGE_KEY);
    return stored === null ? [] : normalizeConversationSessions(JSON.parse(stored) as unknown);
  } catch {
    return [];
  }
}

export function saveConversationSessions(
  sessions: readonly ConversationSession[],
  storage?: ConversationSessionStorage,
): boolean {
  const target = storage ?? defaultStorage();
  if (!target) return false;

  try {
    target.setItem(
      CONVERSATION_SESSIONS_STORAGE_KEY,
      JSON.stringify(normalizeConversationSessions(sessions)),
    );
    return true;
  } catch {
    return false;
  }
}

export function saveConversationSessionsWithQuotaRecovery(
  sessions: readonly ConversationSession[],
  storage?: ConversationSessionStorage,
): ConversationSessionSaveResult {
  const normalized = normalizeConversationSessions(sessions);
  const target = storage ?? defaultStorage();
  if (!target) {
    return { saved: false, sessions: normalized, evictedSessionIds: [], reason: 'storage-unavailable' };
  }

  let candidate = normalized;
  const evictedSessionIds: string[] = [];
  for (;;) {
    try {
      target.setItem(CONVERSATION_SESSIONS_STORAGE_KEY, JSON.stringify(candidate));
      return {
        saved: true,
        sessions: candidate,
        evictedSessionIds,
        ...(evictedSessionIds.length > 0 ? { reason: 'quota' as const } : {}),
      };
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        return { saved: false, sessions: normalized, evictedSessionIds: [], reason: 'write-error' };
      }
      if (candidate.length <= 1) {
        return { saved: false, sessions: normalized, evictedSessionIds: [], reason: 'quota' };
      }
      const evicted = candidate[candidate.length - 1];
      evictedSessionIds.push(evicted.id);
      candidate = candidate.slice(0, -1);
    }
  }
}

function normalizeConversationMessages(value: unknown): ConversationSessionMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeConversationSessionMessage)
    .filter((message): message is ConversationSessionMessage => message !== undefined);
}

function normalizeSessionTitle(value: unknown, messages: readonly ConversationSessionMessage[]): string {
  const normalized = typeof value === 'string' ? shortTitle(value) : undefined;
  if (normalized && normalized !== DEFAULT_CONVERSATION_SESSION_TITLE) return normalized;
  return titleFromFirstUserMessage(messages);
}

function shortTitle(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;

  const characters = Array.from(normalized);
  if (characters.length <= MAX_CONVERSATION_SESSION_TITLE_LENGTH) return normalized;
  return `${characters.slice(0, MAX_CONVERSATION_SESSION_TITLE_LENGTH - 1).join('')}…`;
}

function createSessionId(timestamp: number): string {
  return `session-${timestamp.toString(36)}-${createUniqueSuffix()}`;
}

function isMoreRecent(candidate: ConversationSession, current: ConversationSession): boolean {
  if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
  return candidate.createdAt > current.createdAt;
}

function compareMostRecentFirst(left: ConversationSession, right: ConversationSession): number {
  return right.updatedAt - left.updatedAt || right.createdAt - left.createdAt || left.id.localeCompare(right.id);
}

function normalizeTimestamp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function isChatMode(value: unknown): value is ChatMode {
  return typeof value === 'string' && CHAT_MODES.has(value as ChatMode);
}

function normalizePresetId(value: unknown, mode: ChatMode): WorkflowPresetId | undefined {
  return value === 'brainstorm' && mode === 'free' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isQuotaExceededError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22 || error.code === 1014;
  }
  if (!isRecord(error)) return false;
  const name = typeof error.name === 'string' ? error.name : '';
  const message = typeof error.message === 'string' ? error.message : '';
  const code = typeof error.code === 'number' ? error.code : undefined;
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014 || /quota/i.test(message);
}

function defaultStorage(): ConversationSessionStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

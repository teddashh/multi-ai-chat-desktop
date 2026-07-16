import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_SESSIONS_STORAGE_KEY,
  DEFAULT_CONVERSATION_SESSION_TITLE,
  MAX_CONVERSATION_SESSIONS,
  MAX_CONVERSATION_SESSION_TITLE_LENGTH,
  createConversationSession,
  loadConversationSessions,
  normalizeConversationSession,
  normalizeConversationSessions,
  removeConversationSession,
  saveConversationSessions,
  saveConversationSessionsWithQuotaRecovery,
  sessionContentChanged,
  titleFromFirstUserMessage,
  upsertConversationSession,
  type ConversationSession,
  type ConversationSessionStorage,
} from '../ui/conversationSessions';

function session(id: string, updatedAt: number, overrides: Partial<ConversationSession> = {}): ConversationSession {
  return {
    id,
    title: `Session ${id}`,
    createdAt: updatedAt,
    updatedAt,
    mode: 'free',
    messages: [],
    ...overrides,
  };
}

function memoryStorage(initial: string | null = null): ConversationSessionStorage & { value: string | null } {
  return {
    value: initial,
    getItem(key) {
      expect(key).toBe(CONVERSATION_SESSIONS_STORAGE_KEY);
      return this.value;
    },
    setItem(key, value) {
      expect(key).toBe(CONVERSATION_SESSIONS_STORAGE_KEY);
      this.value = value;
    },
  };
}

describe('conversation sessions', () => {
  it('creates a deterministic session and derives a short title from the first user message', () => {
    const firstUserContent = `  ${'A'.repeat(MAX_CONVERSATION_SESSION_TITLE_LENGTH)}\nmore words  `;
    const created = createConversationSession({
      id: ' session-1 ',
      mode: 'consult',
      now: 123,
      messages: [
        { id: 'ai-1', role: 'ai', content: 'AI preface', provider: 'claude' },
        { id: 'user-1', role: 'user', content: firstUserContent, authorLabel: ' You ' },
        { id: 'user-2', role: 'user', content: 'Do not use this title' },
      ],
    });

    expect(created).toMatchObject({
      id: 'session-1',
      mode: 'consult',
      createdAt: 123,
      updatedAt: 123,
    });
    expect(created.title).toHaveLength(MAX_CONVERSATION_SESSION_TITLE_LENGTH);
    expect(created.title.endsWith('…')).toBe(true);
    expect(created.messages[1]).toMatchObject({ authorLabel: 'You' });
  });

  it('uses a normalized first user message title and falls back for missing content', () => {
    expect(titleFromFirstUserMessage([{ role: 'user', content: '  Explain\n  this\tcode  ' }])).toBe(
      'Explain this code',
    );
    expect(titleFromFirstUserMessage([{ role: 'ai', content: 'Only AI' }])).toBe(
      DEFAULT_CONVERSATION_SESSION_TITLE,
    );
  });

  it('normalizes untrusted sessions and message metadata defensively', () => {
    expect(
      normalizeConversationSession({
        id: ' saved ',
        title: DEFAULT_CONVERSATION_SESSION_TITLE,
        createdAt: 20,
        updatedAt: 10,
        mode: 'unknown',
        messages: [
          {
            id: ' user ',
            role: 'user',
            content: 'Recovered title',
            provider: ' custom-provider ',
            authorLabel: ' Person ',
            modeRole: ' Reviewer ',
            final: false,
            truncated: true,
            ignored: 'field',
          },
          { id: 'bad-role', role: 'system', content: 'drop me' },
          { id: 'bad-content', role: 'ai', content: 12 },
          null,
        ],
      }),
    ).toEqual({
      id: 'saved',
      title: 'Recovered title',
      createdAt: 20,
      updatedAt: 20,
      mode: 'free',
      messages: [
        {
          id: 'user',
          role: 'user',
          content: 'Recovered title',
          provider: 'custom-provider',
          authorLabel: 'Person',
          modeRole: 'Reviewer',
          final: false,
          truncated: true,
        },
      ],
    });
    expect(normalizeConversationSession({ id: ' ' })).toBeUndefined();
    expect(normalizeConversationSessions({ sessions: [] })).toEqual([]);
  });

  it('upserts immutably, replaces matching ids, sorts by recency, and caps at 30', () => {
    const original = [session('same', 1, { title: DEFAULT_CONVERSATION_SESSION_TITLE })];
    const replacement = session('same', 40, {
      title: DEFAULT_CONVERSATION_SESSION_TITLE,
      messages: [{ id: 'question', role: 'user', content: 'Generated after the first update' }],
    });
    const replaced = upsertConversationSession(original, replacement);

    expect(replaced).toHaveLength(1);
    expect(replaced[0]).toMatchObject({ id: 'same', title: 'Generated after the first update', updatedAt: 40 });
    expect(original[0].title).toBe(DEFAULT_CONVERSATION_SESSION_TITLE);

    const many = Array.from({ length: MAX_CONVERSATION_SESSIONS + 5 }, (_, index) => session(`s-${index}`, index));
    const normalized = normalizeConversationSessions([
      ...many,
      session('s-34', 2),
      session('s-34', 50, { title: 'newest duplicate' }),
    ]);

    expect(normalized).toHaveLength(MAX_CONVERSATION_SESSIONS);
    expect(normalized[0]).toMatchObject({ id: 's-34', title: 'newest duplicate', updatedAt: 50 });
    expect(normalized.at(-1)?.id).toBe('s-5');
  });

  it('treats re-opening a conversation as unchanged so its sidebar date stays put', () => {
    const messages = [{ id: 'user-1', role: 'user' as const, content: 'Hello', authorLabel: 'Person', final: true }];
    const existing = session('s-1', 10, { mode: 'free', messages });

    expect(sessionContentChanged(existing, [...messages], 'free')).toBe(false);
    expect(sessionContentChanged(existing, [...messages, { id: 'ai-1', role: 'ai', content: 'Reply' }], 'free')).toBe(true);
    expect(sessionContentChanged(existing, [...messages], 'debate')).toBe(true);
    expect(sessionContentChanged(existing, [{ ...messages[0], authorLabel: 'Someone else' }], 'free')).toBe(true);
  });

  it('removes only the named session and leaves the others intact', () => {
    const original = [session('keep', 20), session('drop', 10)];
    const remaining = removeConversationSession(original, 'drop');

    expect(remaining.map((entry) => entry.id)).toEqual(['keep']);
    expect(original).toHaveLength(2);
    expect(removeConversationSession(original, 'missing').map((entry) => entry.id)).toEqual(['keep', 'drop']);
  });

  it('round-trips through injected storage and only persists the newest 30 sessions', () => {
    const storage = memoryStorage();
    const sessions = Array.from({ length: MAX_CONVERSATION_SESSIONS + 2 }, (_, index) => session(`s-${index}`, index));

    expect(saveConversationSessions(sessions, storage)).toBe(true);
    expect(loadConversationSessions(storage)).toEqual(normalizeConversationSessions(sessions));
    expect(JSON.parse(storage.value ?? '[]')).toHaveLength(MAX_CONVERSATION_SESSIONS);
  });

  it('recovers only from quota errors and reports the exact sessions that were persisted', () => {
    const storage = memoryStorage();
    const sessions = [session('newest', 30), session('middle', 20), session('oldest', 10)];
    const twoSessionLength = JSON.stringify(normalizeConversationSessions(sessions.slice(0, 2))).length;
    const quotaStorage: ConversationSessionStorage = {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => {
        if (value.length > twoSessionLength) throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
        storage.setItem(key, value);
      },
    };

    expect(saveConversationSessionsWithQuotaRecovery(sessions, quotaStorage)).toEqual({
      saved: true,
      sessions: normalizeConversationSessions(sessions.slice(0, 2)),
      evictedSessionIds: ['oldest'],
      reason: 'quota',
    });
    expect(loadConversationSessions(storage).map((entry) => entry.id)).toEqual(['newest', 'middle']);
  });

  it('does not evict history for non-quota storage failures', () => {
    let attempts = 0;
    const storage: ConversationSessionStorage = {
      getItem: () => null,
      setItem: () => {
        attempts += 1;
        throw new Error('storage permission denied');
      },
    };
    const sessions = [session('newest', 20), session('oldest', 10)];

    expect(saveConversationSessionsWithQuotaRecovery(sessions, storage)).toEqual({
      saved: false,
      sessions: normalizeConversationSessions(sessions),
      evictedSessionIds: [],
      reason: 'write-error',
    });
    expect(attempts).toBe(1);
  });

  it('does not crash on broken JSON or storage failures', () => {
    expect(loadConversationSessions(memoryStorage('{not json'))).toEqual([]);

    const throwingRead: ConversationSessionStorage = {
      getItem: () => {
        throw new Error('storage denied');
      },
      setItem: () => undefined,
    };
    const throwingWrite: ConversationSessionStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };

    expect(loadConversationSessions(throwingRead)).toEqual([]);
    expect(saveConversationSessions([], throwingWrite)).toBe(false);
  });
});

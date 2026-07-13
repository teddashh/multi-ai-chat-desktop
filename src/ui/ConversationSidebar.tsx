import { useEffect, useState } from 'react';
import appIconUrl from '../assets/app-icon.svg';
import { AiSisterBrandMark } from './AiSisterTheme';
import { DEFAULT_CONVERSATION_SESSION_TITLE, type ConversationSession } from './conversationSessions';

export interface ConversationSidebarLabels {
  toggle: string;
  newConversation: string;
  history: string;
  empty: string;
  deleteConversation: string;
  confirmDeleteConversation: string;
}

export function ConversationSidebar({
  collapsed,
  sessions,
  activeSessionId,
  disabled,
  labels,
  locale,
  onToggle,
  onNewConversation,
  onSelectSession,
  onDeleteSession,
}: {
  collapsed: boolean;
  sessions: readonly ConversationSession[];
  activeSessionId: string;
  disabled: boolean;
  labels: ConversationSidebarLabels;
  locale: string;
  onToggle: () => void;
  onNewConversation: () => void;
  onSelectSession: (session: ConversationSession) => void;
  onDeleteSession: (session: ConversationSession) => void;
}) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | undefined>();

  useEffect(() => {
    if (
      pendingDeleteId
      && (collapsed || disabled || !sessions.some((session) => session.id === pendingDeleteId))
    ) {
      setPendingDeleteId(undefined);
    }
  }, [collapsed, disabled, pendingDeleteId, sessions]);

  return (
    <nav
      aria-label={labels.history}
      className={`ai-sister-session-sidebar ${collapsed ? 'w-14' : 'w-48'} flex min-h-0 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 transition-[width] dark:border-zinc-800 dark:bg-zinc-900`}
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 p-2 dark:border-zinc-800">
        <button
          type="button"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md hover:bg-white focus-visible:outline-offset-2 dark:hover:bg-zinc-800"
          aria-label={labels.toggle}
          title={labels.toggle}
          onClick={onToggle}
        >
          <img src={appIconUrl} alt="" className="default-brand-icon h-8 w-8" />
          <AiSisterBrandMark className="h-8 w-8" />
        </button>
        {!collapsed ? (
          <span className="min-w-0 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Multi-AI Chat
            <span className="ai-sister-only ai-sister-brand-subtitle">AI-Sister Edition</span>
          </span>
        ) : null}
      </div>

      <div className="p-2">
        <button
          type="button"
          className={`${collapsed ? 'grid h-9 w-9 place-items-center p-0' : 'flex w-full items-center gap-2 px-3 py-2'} rounded-md border border-sky-300 bg-white text-sm font-medium text-sky-800 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-800 dark:bg-zinc-950 dark:text-sky-200 dark:hover:bg-sky-950`}
          onClick={onNewConversation}
          disabled={disabled}
          aria-label={labels.newConversation}
          title={labels.newConversation}
        >
          <span className="text-lg leading-none" aria-hidden="true">＋</span>
          {!collapsed ? <span>{labels.newConversation}</span> : null}
        </button>
      </div>

      {!collapsed ? (
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
          <h2 className="px-1 pb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{labels.history}</h2>
          <div className="min-h-0 flex-1 overflow-auto">
            {sessions.length === 0 ? (
              <div className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">{labels.empty}</div>
            ) : (
              <ol className="space-y-1">
                {sessions.map((session) => (
                  <li key={session.id} className="flex items-stretch gap-1">
                    <button
                      type="button"
                      className={`min-w-0 flex-1 rounded-md px-2 py-2 text-left transition ${
                        session.id === activeSessionId
                          ? 'bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100'
                          : 'text-zinc-700 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                      onClick={() => onSelectSession(session)}
                      disabled={disabled}
                      aria-current={session.id === activeSessionId ? 'page' : undefined}
                    >
                      <span className="block truncate text-xs font-medium">
                        {session.title === DEFAULT_CONVERSATION_SESSION_TITLE ? labels.newConversation : session.title}
                      </span>
                      <span className="mt-1 block text-[0.625rem] text-zinc-500 dark:text-zinc-400">
                        {new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(session.updatedAt)}
                      </span>
                    </button>
                    {pendingDeleteId === session.id ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-md border border-red-300 px-2 text-[0.625rem] font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950"
                        onClick={() => {
                          setPendingDeleteId(undefined);
                          onDeleteSession(session);
                        }}
                        onBlur={() => setPendingDeleteId(undefined)}
                        disabled={disabled}
                        aria-label={labels.confirmDeleteConversation}
                        title={labels.confirmDeleteConversation}
                        autoFocus
                      >
                        {labels.confirmDeleteConversation}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="shrink-0 rounded-md px-2 text-xs text-zinc-400 transition hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-500 dark:hover:bg-red-950 dark:hover:text-red-200"
                        onClick={() => setPendingDeleteId(session.id)}
                        disabled={disabled}
                        aria-label={labels.deleteConversation}
                        title={labels.deleteConversation}
                      >
                        <span aria-hidden="true">✕</span>
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}
    </nav>
  );
}

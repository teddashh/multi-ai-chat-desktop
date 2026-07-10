import { Component, type ReactNode } from 'react';
import { useI18n } from '../i18n/context';

interface AppErrorBoundaryState {
  failed: boolean;
}

class ErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <FatalErrorView />;
    return this.props.children;
  }
}

export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

function FatalErrorView() {
  const { t } = useI18n();
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-50 p-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <section className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-6 shadow-lg dark:border-red-900 dark:bg-zinc-900">
        <h1 className="text-lg font-semibold">{t('fatal.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{t('fatal.description')}</p>
        <button
          type="button"
          className="mt-5 rounded border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          onClick={() => window.location.reload()}
        >
          {t('fatal.reload')}
        </button>
      </section>
    </main>
  );
}

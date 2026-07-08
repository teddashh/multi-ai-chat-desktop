import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ProviderState } from '../../shared/types';
import type { Locale } from '../i18n/resolve';
import { t } from '../i18n/t';
import { isSendable } from '../workflow';
import { toggleTarget } from './targets';

export function TargetChips({
  providers,
  states,
  selected,
  onChange,
  locale = 'en',
}: {
  providers: AIProvider[];
  states: Record<AIProvider, ProviderState>;
  selected: AIProvider[];
  onChange: (selected: AIProvider[]) => void;
  locale?: Locale;
}) {
  return (
    <>
      {providers.map((provider) => {
        const sendable = isSendable(states[provider]);
        const active = selected.includes(provider);
        return (
          <button
            key={provider}
            disabled={!sendable}
            onClick={() => onChange(toggleTarget(selected, provider))}
            className={`border px-2 py-1 text-xs ${
              active && sendable
                ? 'border-emerald-700 bg-emerald-950 text-emerald-200'
                : 'border-zinc-700 text-zinc-400 disabled:opacity-60'
            }`}
          >
            {AI_PROVIDERS[provider].name}:{' '}
            {sendable ? (active ? t('connection.readySelected', locale) : t('connection.readyOff', locale)) : t('connection.notReady', locale)}
          </button>
        );
      })}
    </>
  );
}

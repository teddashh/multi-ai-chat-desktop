import { CHAT_MODES } from '../../shared/constants';
import type { ChatMode } from '../../shared/types';

const MODES = Object.keys(CHAT_MODES) as ChatMode[];

export function ModeSelector({ mode, onModeChange }: { mode: ChatMode; onModeChange: (mode: ChatMode) => void }) {
  return (
    <div className="flex gap-1">
      {MODES.map((candidate) => {
        const info = CHAT_MODES[candidate];
        const active = mode === candidate;
        return (
          <button
            key={candidate}
            onClick={() => onModeChange(candidate)}
            className={`flex-1 border px-2 py-1.5 text-xs font-medium transition ${
              active ? 'border-sky-500 bg-sky-900 text-white' : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800'
            }`}
            title={info.description}
          >
            <span className="mr-1">{info.icon}</span>
            {info.name}
          </button>
        );
      })}
    </div>
  );
}

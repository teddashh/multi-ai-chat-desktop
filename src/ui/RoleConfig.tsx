import { AI_PROVIDERS } from '../../shared/constants';
import type { AIProvider, ChatMode, ModeRoles } from '../../shared/types';
import { isSerialMode, ROLE_KEYS, ROLE_LABELS, updateModeRole } from './modeRoles';

const PROVIDERS = Object.keys(AI_PROVIDERS) as AIProvider[];

export function RoleConfig({
  mode,
  roles,
  onRolesChange,
}: {
  mode: ChatMode;
  roles: ModeRoles;
  onRolesChange: (roles: ModeRoles) => void;
}) {
  if (!isSerialMode(mode)) return null;
  return (
    <div className="mt-3 space-y-2 border border-zinc-800 bg-zinc-900 p-3">
      {ROLE_KEYS[mode].map((roleKey) => (
        <div key={roleKey} className="flex items-start gap-2">
          <span className="w-20 flex-none pt-1 text-xs text-zinc-300">{ROLE_LABELS[mode][roleKey]}</span>
          <div className="grid flex-1 grid-cols-2 gap-1">
            {PROVIDERS.map((provider) => {
              const selected = (roles as unknown as Record<string, AIProvider>)[roleKey] === provider;
              return (
                <button
                  key={provider}
                  onClick={() => onRolesChange(updateModeRole(roles, roleKey, provider))}
                  className={`px-2 py-1 text-center text-xs transition ${selected ? 'font-bold' : 'text-zinc-500 hover:text-zinc-200'}`}
                  style={selected ? { backgroundColor: `${AI_PROVIDERS[provider].color}33`, color: AI_PROVIDERS[provider].color } : undefined}
                >
                  {AI_PROVIDERS[provider].name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

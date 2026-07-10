import type { ChatMode } from '../../shared/types';
import type { I18nKey } from './keys';
import type { Locale } from './resolve';
import { t } from './t';

export const MODE_NAME_KEYS: Record<ChatMode, I18nKey> = {
  free: 'mode.free.name',
  debate: 'mode.debate.name',
  consult: 'mode.consult.name',
  coding: 'mode.coding.name',
  roundtable: 'mode.roundtable.name',
};

export function modeName(mode: ChatMode, locale: Locale): string {
  return t(MODE_NAME_KEYS[mode], locale);
}

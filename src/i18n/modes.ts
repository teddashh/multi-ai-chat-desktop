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

export const MODE_DESCRIPTION_KEYS: Record<ChatMode, I18nKey> = {
  free: 'mode.free.description',
  debate: 'mode.debate.description',
  consult: 'mode.consult.description',
  coding: 'mode.coding.description',
  roundtable: 'mode.roundtable.description',
};

export function modeName(mode: ChatMode, locale: Locale): string {
  return t(MODE_NAME_KEYS[mode], locale);
}

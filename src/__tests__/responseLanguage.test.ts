import { describe, expect, it } from 'vitest';
import {
  appendResponseLanguagePolicy,
  createResponseLanguagePolicy,
  isResponseLanguagePolicy,
  responseLanguageDirective,
  responseLanguagePolicyFromPrompt,
} from '../workflow/responseLanguage';

describe('response language policy', () => {
  it('keeps prompts unchanged when no response-language policy was supplied', () => {
    expect(appendResponseLanguagePolicy('original prompt')).toBe('original prompt');
  });

  it('uses question and conversation language before the interface fallback in Auto mode', () => {
    const policy = createResponseLanguagePolicy('auto', 'zh-TW');
    const directive = responseLanguageDirective(policy);

    expect(directive).toContain('explicit output-language request(s)');
    expect(directive).toContain('primary language of the user-authored prose');
    expect(directive).toContain('language previously used by the user');
    expect(directive).toContain('Traditional Chinese (zh-TW) (the app interface language fallback)');
    expect(directive).toContain('does not change the requested task, output modality, structure, or format');
    expect(directive).toContain('Do not infer it from these workflow instructions, other AI responses');
    expect(directive).toContain('attachments, code, identifiers, URLs, or filenames');
    expect(appendResponseLanguagePolicy('original prompt', policy)).toBe(`original prompt\n\n${directive}`);
  });

  it('lets a fixed response-language preference override inferred question language', () => {
    const directive = responseLanguageDirective(createResponseLanguagePolicy('de', 'en'));

    expect(directive).toContain('explicit output-language request(s)');
    expect(directive).toContain('Otherwise, reply in German (de).');
    expect(directive).not.toContain('app interface language fallback');
  });

  it('restores the last valid policy tag from a retained snapshot prompt', () => {
    const policy = createResponseLanguagePolicy('auto', 'ja');
    const prompt = [
      '<response-language-policy version="1" setting="de" interface-locale="de">',
      appendResponseLanguagePolicy('original prompt', policy),
    ].join('\n');

    expect(responseLanguagePolicyFromPrompt(prompt)).toEqual(policy);
    expect(responseLanguagePolicyFromPrompt('<response-language-policy version="99" setting="auto" interface-locale="en">')).toBeUndefined();
    expect(isResponseLanguagePolicy(policy)).toBe(true);
  });
});

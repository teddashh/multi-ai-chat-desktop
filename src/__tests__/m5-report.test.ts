import { describe, expect, it } from 'vitest';
import { buildReportDigest, DIGEST_CAP_BYTES, type ReportElement, type ReportEnv } from '../../injected/reportDigest';
import { formatReportBody } from '../ui/reportBroken';

interface AdapterInput {
  provider: string;
  displayName?: string;
  adapterVersion: number;
  inputSelectors?: string[];
  sendButtonSelectors?: string[];
  responseSelectors?: string[];
  loginDetectors?: string[];
}

function fakeElement(tagName: string, attrs: Record<string, string>, textContent: string): ReportElement {
  return {
    tagName,
    getAttribute: (name: string) => attrs[name] ?? null,
    textContent,
  };
}

function fakeEnv(matches: Record<string, ReportElement[]>, href = 'https://chatgpt.com/c/abc?secret=1#frag'): ReportEnv {
  return {
    href,
    appVersion: '0.1.0',
    querySelectorAll: (selector: string) => matches[selector] ?? [],
  };
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

const baseAdapter: AdapterInput = {
  provider: 'chatgpt',
  displayName: 'ChatGPT',
  adapterVersion: 3,
  inputSelectors: ['#prompt'],
  sendButtonSelectors: ['button.send'],
  responseSelectors: ['.assistant'],
  loginDetectors: ['#prompt'],
};

describe('M5 report diagnostics', () => {
  it('collects candidates when all input selectors miss', () => {
    const digest = buildReportDigest(
      { ...baseAdapter, inputSelectors: ['#missing', '.also-missing'], sendButtonSelectors: [], responseSelectors: [], loginDetectors: [] },
      fakeEnv({
        textarea: [fakeElement('TEXTAREA', { id: 'candidate' }, 'private page text')],
      }),
    );

    expect(digest.firstMissingField).toBe('inputSelectors');
    expect(digest.candidates.length).toBeGreaterThan(0);
  });

  it('partitions matched and missed selectors per field', () => {
    const digest = buildReportDigest(
      {
        ...baseAdapter,
        inputSelectors: ['#hit', '#miss'],
        sendButtonSelectors: ['button.hit', 'button.miss'],
        responseSelectors: ['.response'],
        loginDetectors: ['.login', '.login-miss'],
      },
      fakeEnv({
        '#hit': [fakeElement('TEXTAREA', {}, '')],
        'button.hit': [fakeElement('BUTTON', {}, '')],
        '.response': [fakeElement('DIV', {}, '')],
        '.login': [fakeElement('DIV', {}, '')],
      }),
    );

    expect(digest.fields.find((field) => field.field === 'inputSelectors')).toEqual({
      field: 'inputSelectors',
      matched: ['#hit'],
      missed: ['#miss'],
      state: 'available',
    });
    expect(digest.fields.find((field) => field.field === 'sendButtonSelectors')).toEqual({
      field: 'sendButtonSelectors',
      matched: ['button.hit'],
      missed: ['button.miss'],
      state: 'available',
    });
    expect(digest.fields.find((field) => field.field === 'loginDetectors')).toEqual({
      field: 'loginDetectors',
      matched: ['.login'],
      missed: ['.login-miss'],
      state: 'available',
    });
  });

  it('does not treat conditional controls on an empty new-session page as broken', () => {
    const digest = buildReportDigest(
      baseAdapter,
      fakeEnv({
        '#prompt': [fakeElement('DIV', { contenteditable: 'true' }, '')],
      }, 'https://chatgpt.com/'),
    );

    expect(digest.pageContext).toBe('new-session');
    expect(digest.composerHasText).toBe(false);
    expect(digest.fields.find((field) => field.field === 'sendButtonSelectors')).toMatchObject({
      state: 'not-rendered',
      reason: 'composer-empty',
    });
    expect(digest.fields.find((field) => field.field === 'responseSelectors')).toMatchObject({
      state: 'not-rendered',
      reason: 'new-session',
    });
    expect(digest.firstMissingField).toBeUndefined();
    expect(digest.candidates).toEqual([]);
    expect(formatReportBody(digest)).toContain('No actionable structural selector failure was detected.');
  });

  it('treats a missing send control as actionable after a draft exists', () => {
    const composer = { ...fakeElement('TEXTAREA', {}, ''), value: 'draft waiting to send' };
    const digest = buildReportDigest(
      baseAdapter,
      fakeEnv({
        '#prompt': [composer],
      }, 'https://chatgpt.com/'),
    );

    expect(digest.composerHasText).toBe(true);
    expect(digest.fields.find((field) => field.field === 'sendButtonSelectors')).toMatchObject({ state: 'missing' });
    expect(digest.firstMissingField).toBe('sendButtonSelectors');
  });

  it('does not enumerate unused fallbacks when one selector is available', () => {
    const digest = buildReportDigest(
      {
        ...baseAdapter,
        inputSelectors: ['#prompt', '#legacy-prompt'],
        sendButtonSelectors: [],
        responseSelectors: [],
        loginDetectors: [],
      },
      fakeEnv({ '#prompt': [fakeElement('TEXTAREA', {}, '')] }),
    );
    const body = formatReportBody(digest);

    expect(body).toContain('1/2 ordered fallbacks matched');
    expect(body).not.toContain('unmatched fallback: `#legacy-prompt`');
  });

  it('stores only the URL path', () => {
    const digest = buildReportDigest(baseAdapter, fakeEnv({ '#prompt': [fakeElement('TEXTAREA', {}, '')] }, 'https://chatgpt.com/c/abc?token=secret#frag'));

    expect(digest.path).toBe('/c/abc');
  });

  it('truncates allowlisted attrs and never serializes text content', () => {
    const pageText = 'LEAK_ME_PAGE_TEXT';
    const digest = buildReportDigest(
      { ...baseAdapter, inputSelectors: ['#missing'], sendButtonSelectors: [], responseSelectors: [], loginDetectors: [] },
      fakeEnv({
        textarea: [
          fakeElement(
            'TEXTAREA',
            {
              id: 'x'.repeat(60),
              class: 'composer private-class',
              'data-testid': 'prompt-box',
              'aria-label': 'Prompt composer',
              title: 'forbidden-title',
            },
            pageText,
          ),
        ],
      }),
    );

    expect(digest.candidates[0].attrs.id).toHaveLength(40);
    expect(digest.candidates[0].attrs).toEqual({
      id: 'x'.repeat(40),
      class: 'composer private-class',
      'data-testid': 'prompt-box',
      'aria-label': 'Prompt composer',
    });
    expect(typeof digest.candidates[0].textLength).toBe('number');
    const serialized = JSON.stringify(digest);
    expect(serialized).not.toContain(pageText);
    expect(serialized).not.toContain('forbidden-title');
    expect(serialized).not.toContain('textContent');
  });

  it('drops candidates when needed to stay under the 10 KB cap', () => {
    const candidates = Array.from({ length: 100 }, (_, index) =>
      fakeElement(
        'BUTTON',
        {
          id: `${index}-${'x'.repeat(500)}`,
          class: 'x'.repeat(500),
          'data-testid': 'x'.repeat(500),
          'aria-label': 'x'.repeat(500),
        },
        'private text',
      ),
    );
    let digest = buildReportDigest(baseAdapter, fakeEnv({ button: candidates }));
    for (let count = 1; digest.candidates.length > 0 && count <= 200; count += 1) {
      digest = buildReportDigest(
        {
          ...baseAdapter,
          inputSelectors: Array.from({ length: count }, (_, index) => `.missing-${index}-${'x'.repeat(80)}`),
          sendButtonSelectors: [],
          responseSelectors: [],
          loginDetectors: [],
        },
        fakeEnv({ button: candidates }),
      );
    }

    expect(digest.candidates).toEqual([]);
    expect(byteLength(JSON.stringify(digest))).toBeLessThanOrEqual(10 * 1024);
  });

  it('caps the assembled report body to the 10 KB privacy limit', () => {
    const fields = ['inputSelectors', 'sendButtonSelectors', 'responseSelectors', 'loginDetectors'].map((field, fieldIndex) => ({
      field,
      matched: [],
      missed: Array.from({ length: 100 }, (_, index) => `.missing-${fieldIndex}-${index}-${'x'.repeat(120)}`),
      state: 'missing' as const,
    }));
    const digest = {
      provider: 'chatgpt',
      displayName: 'ChatGPT',
      adapterVersion: 3,
      appVersion: '0.1.0',
      path: `/${'long-path/'.repeat(500)}`,
      pageContext: 'unknown' as const,
      composerHasText: false,
      fields,
      firstMissingField: 'inputSelectors',
      candidates: Array.from({ length: 5 }, (_, index) => ({
        tag: 'button',
        attrs: {
          id: `candidate-${index}-${'x'.repeat(200)}`,
          class: 'x'.repeat(200),
          'data-testid': 'x'.repeat(200),
          'aria-label': 'x'.repeat(200),
        },
        textLength: 1000 + index,
      })),
    };

    expect(byteLength(formatReportBody(digest))).toBeLessThanOrEqual(DIGEST_CAP_BYTES);
  });

  it('bounds the URL path in the report digest', () => {
    const href = `https://chatgpt.com/${'very-long-path/'.repeat(100)}?token=secret#frag`;
    const digest = buildReportDigest(baseAdapter, fakeEnv({ '#prompt': [fakeElement('TEXTAREA', {}, '')] }, href));

    expect(digest.path.length).toBeLessThanOrEqual(200);
  });

  it('formats a preview body with no raw page text', () => {
    const pageText = 'LEAK_ME_FORMAT_BODY';
    const digest = buildReportDigest(
      { ...baseAdapter, inputSelectors: ['#missing'], sendButtonSelectors: [], responseSelectors: [], loginDetectors: [] },
      fakeEnv({
        textarea: [fakeElement('TEXTAREA', { id: 'candidate' }, pageText)],
      }),
    );
    const body = formatReportBody(digest);

    expect(body).toContain('**Provider:** ChatGPT (chatgpt)');
    expect(body).toContain('**Adapter version:** 3');
    expect(body).toContain('**Path:** /c/abc');
    expect(body).toContain('unmatched fallback: `#missing`');
    expect(body).toContain('Selector-structural diagnostics only');
    expect(body).not.toContain(pageText);
  });
});

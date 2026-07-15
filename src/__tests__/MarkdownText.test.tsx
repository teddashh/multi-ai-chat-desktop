import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownText } from '../ui/MarkdownText';

function renderMarkdown(text: string): string {
  return renderToStaticMarkup(<MarkdownText text={text} />);
}

describe('MarkdownText', () => {
  it('renders block elements and preserves soft line breaks', () => {
    const html = renderMarkdown(`# Heading

first line
second line

- alpha
- beta

3. third
4. fourth

> quoted line
> next line

---`);

    expect(html).toContain('<h1');
    expect(html).toContain('>Heading</h1>');
    expect(html).toContain('first line<br/>second line');
    expect(html).toContain('<ul');
    expect(html).toContain('<ol');
    expect(html).toContain('start="3"');
    expect(html.match(/<li/g)).toHaveLength(4);
    expect(html).toContain('<blockquote');
    expect(html).toContain('quoted line<br/>next line');
    expect(html).toContain('<hr');
  });

  it('renders inline code, emphasis, and safe web links', () => {
    const html = renderMarkdown(
      'Use `<tag>`, **bold**, *italic*, [the site](https://example.com/path?q=one&lang=en), and http://example.org/docs.',
    );

    expect(html).toContain('<code');
    expect(html).toContain('&lt;tag&gt;</code>');
    expect(html).toContain('<strong');
    expect(html).toContain('>bold</strong>');
    expect(html).toContain('<em');
    expect(html).toContain('>italic</em>');
    expect(html).toContain('href="https://example.com/path?q=one&amp;lang=en"');
    expect(html).toContain('href="http://example.org/docs"');
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
  });

  it('keeps fenced code literal and preserves its newlines', () => {
    const html = renderMarkdown('```tsx\n<script>alert("x")</script>\nconst value = "**not bold**";\n```');

    expect(html).toContain('<pre');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;\nconst value = &quot;**not bold**&quot;;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<strong');
  });

  it('renders serialized GFM tables with escaped cell pipes', () => {
    const html = renderMarkdown('| Name | Value |\n| --- | --- |\n| alpha | a\\|b |');

    expect(html).toContain('<table');
    expect(html).toContain('<th');
    expect(html.match(/<td/g)).toHaveLength(2);
    expect(html).toContain('a|b');
    expect(html).not.toContain('a\\|b');
  });

  it('escapes plain text and refuses non-http link protocols', () => {
    const html = renderMarkdown(
      '<img src=x onerror=alert(1)>\n<script>alert("x")</script>\n[bad](javascript:alert(1)) [also bad](data:text/html,boom)',
    );

    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html).toContain('[bad](javascript:alert(1))');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('href="data:');
    expect(html).not.toContain('target="_blank"');
  });
});

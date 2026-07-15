import type { ReactNode } from 'react';

export interface MarkdownTextProps {
  text: string;
}

interface Fence {
  character: '`' | '~';
  length: number;
}

interface ListItemMatch {
  content: string;
  ordered: boolean;
  start: number;
}

interface MarkdownLinkMatch {
  end: number;
  href: string | null;
  label: string;
  raw: string;
}

interface MarkdownTableMatch {
  header: string[];
  rows: string[][];
  nextCursor: number;
}

const headingClasses = [
  'mb-3 mt-5 text-2xl font-bold first:mt-0',
  'mb-2 mt-4 text-xl font-bold first:mt-0',
  'mb-2 mt-4 text-lg font-semibold first:mt-0',
  'mb-2 mt-3 text-base font-semibold first:mt-0',
  'mb-1 mt-3 text-sm font-semibold first:mt-0',
  'mb-1 mt-3 text-xs font-semibold uppercase tracking-wide first:mt-0',
] as const;

function safeHttpUrl(value: string): string | null {
  const trimmed = value.trim();
  const containsControlCharacter = Array.from(trimmed).some((character) => {
    const characterCode = character.charCodeAt(0);
    return characterCode <= 31 || characterCode === 127;
  });
  if (!/^https?:\/\//i.test(trimmed) || containsControlCharacter) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}]/u.test(character);
}

function findClosingMarker(text: string, marker: string, contentStart: number): number {
  let searchFrom = contentStart;

  while (searchFrom < text.length) {
    const closingIndex = text.indexOf(marker, searchFrom);
    if (closingIndex < 0) return -1;

    const hasContent = closingIndex > contentStart;
    const touchesWhitespace = /\s/.test(text[closingIndex - 1] ?? '');
    const closesInsideWord = marker[0] === '_' && isWordCharacter(text[closingIndex + marker.length]);
    if (hasContent && !touchesWhitespace && !closesInsideWord && !isEscaped(text, closingIndex)) return closingIndex;

    searchFrom = closingIndex + 1;
  }

  return -1;
}

function readMarkdownLink(text: string, start: number): MarkdownLinkMatch | null {
  if (text[start] !== '[' || text[start - 1] === '!') return null;

  let labelEnd = start + 1;
  while (labelEnd < text.length) {
    if (text[labelEnd] === ']' && !isEscaped(text, labelEnd)) break;
    if (text[labelEnd] === '\n') return null;
    labelEnd += 1;
  }

  if (labelEnd >= text.length || text[labelEnd + 1] !== '(') return null;

  const destinationStart = labelEnd + 2;
  let parenthesisDepth = 0;
  let destinationEnd = destinationStart;

  while (destinationEnd < text.length) {
    const character = text[destinationEnd];
    if (character === '\n') return null;
    if (character === '(' && !isEscaped(text, destinationEnd)) parenthesisDepth += 1;
    if (character === ')' && !isEscaped(text, destinationEnd)) {
      if (parenthesisDepth === 0) break;
      parenthesisDepth -= 1;
    }
    destinationEnd += 1;
  }

  if (destinationEnd >= text.length) return null;

  let destination = text.slice(destinationStart, destinationEnd).trim();
  if (destination.startsWith('<') && destination.endsWith('>')) destination = destination.slice(1, -1);

  const end = destinationEnd + 1;
  const label = text.slice(start + 1, labelEnd);
  return {
    end,
    href: label.length > 0 ? safeHttpUrl(destination) : null,
    label,
    raw: text.slice(start, end),
  };
}

function trimBareUrl(text: string): string {
  let end = text.length;

  while (end > 0 && /[.,!?;:]/.test(text[end - 1])) end -= 1;

  for (const [opening, closing] of [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ] as const) {
    while (text[end - 1] === closing) {
      const candidate = text.slice(0, end);
      const openings = candidate.split(opening).length - 1;
      const closings = candidate.split(closing).length - 1;
      if (closings <= openings) break;
      end -= 1;
    }
  }

  return text.slice(0, end);
}

function readBareUrl(text: string, start: number): string | null {
  const remainder = text.slice(start).toLowerCase();
  if (!remainder.startsWith('http://') && !remainder.startsWith('https://')) return null;
  if (isWordCharacter(text[start - 1])) return null;

  let end = start;
  while (end < text.length && !/[\s<>"']/.test(text[end])) end += 1;

  const candidate = trimBareUrl(text.slice(start, end));
  return safeHttpUrl(candidate) ? candidate : null;
}

function renderLink(href: string, label: ReactNode, key: string): ReactNode {
  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-sky-700 underline decoration-sky-400 underline-offset-2 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
    >
      {label}
    </a>
  );
}

function renderInline(text: string, keyPrefix: string, allowLinks = true, depth = 0): ReactNode[] {
  const nodes: ReactNode[] = [];
  let plainText = '';
  let cursor = 0;
  let nodeIndex = 0;

  const nextKey = () => `${keyPrefix}-${nodeIndex++}`;
  const flushPlainText = () => {
    if (!plainText) return;
    nodes.push(plainText);
    plainText = '';
  };

  while (cursor < text.length) {
    const character = text[cursor];

    if (character === '\n') {
      flushPlainText();
      nodes.push(<br key={nextKey()} />);
      cursor += 1;
      continue;
    }

    if (character === '\\' && cursor + 1 < text.length && /[\\`*_[\]()<>]/.test(text[cursor + 1])) {
      plainText += text[cursor + 1];
      cursor += 2;
      continue;
    }

    if (character === '`') {
      let markerLength = 1;
      while (text[cursor + markerLength] === '`') markerLength += 1;
      const marker = '`'.repeat(markerLength);
      const closingIndex = text.indexOf(marker, cursor + markerLength);

      if (closingIndex >= cursor + markerLength) {
        flushPlainText();
        nodes.push(
          <code
            key={nextKey()}
            className="whitespace-pre-wrap rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.9em] dark:bg-zinc-800"
          >
            {text.slice(cursor + markerLength, closingIndex)}
          </code>,
        );
        cursor = closingIndex + markerLength;
        continue;
      }
    }

    if (allowLinks && character === '[') {
      const link = readMarkdownLink(text, cursor);
      if (link) {
        if (!link.href) {
          plainText += link.raw;
        } else {
          flushPlainText();
          nodes.push(renderLink(link.href, renderInline(link.label, `${keyPrefix}-link`, false, depth + 1), nextKey()));
        }
        cursor = link.end;
        continue;
      }
    }

    if (allowLinks && character === '<') {
      const closingIndex = text.indexOf('>', cursor + 1);
      if (closingIndex > cursor + 1) {
        const label = text.slice(cursor + 1, closingIndex);
        const href = safeHttpUrl(label);
        if (href) {
          flushPlainText();
          nodes.push(renderLink(href, label, nextKey()));
          cursor = closingIndex + 1;
          continue;
        }
      }
    }

    if (depth < 20 && (character === '*' || character === '_')) {
      const previousCharacter = text[cursor - 1];
      const intrawordUnderscore = character === '_' && isWordCharacter(previousCharacter);
      const markerLength = text.startsWith(character.repeat(3), cursor)
        ? 3
        : text.startsWith(character.repeat(2), cursor)
          ? 2
          : 1;
      const marker = character.repeat(markerLength);
      const contentStart = cursor + markerLength;
      const canOpen = !intrawordUnderscore && !/\s/.test(text[contentStart] ?? '');
      const closingIndex = canOpen ? findClosingMarker(text, marker, contentStart) : -1;

      if (closingIndex >= 0) {
        flushPlainText();
        const children = renderInline(text.slice(contentStart, closingIndex), `${keyPrefix}-emphasis`, allowLinks, depth + 1);
        if (markerLength === 1) {
          nodes.push(
            <em key={nextKey()} className="italic">
              {children}
            </em>,
          );
        } else if (markerLength === 2) {
          nodes.push(
            <strong key={nextKey()} className="font-semibold">
              {children}
            </strong>,
          );
        } else {
          nodes.push(
            <strong key={nextKey()} className="font-semibold">
              <em className="italic">{children}</em>
            </strong>,
          );
        }
        cursor = closingIndex + markerLength;
        continue;
      }
    }

    if (allowLinks && (character === 'h' || character === 'H')) {
      const label = readBareUrl(text, cursor);
      const href = label ? safeHttpUrl(label) : null;
      if (label && href) {
        flushPlainText();
        nodes.push(renderLink(href, label, nextKey()));
        cursor += label.length;
        continue;
      }
    }

    plainText += character;
    cursor += 1;
  }

  flushPlainText();
  return nodes;
}

function matchFence(line: string): Fence | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match) return null;
  if (match[1][0] === '`' && match[2].includes('`')) return null;
  return { character: match[1][0] as Fence['character'], length: match[1].length };
}

function closesFence(line: string, fence: Fence): boolean {
  const match = line.match(/^ {0,3}(`+|~+)[\t ]*$/);
  return Boolean(match && match[1][0] === fence.character && match[1].length >= fence.length);
}

function matchHeading(line: string): { content: string; level: number } | null {
  const match = line.match(/^ {0,3}(#{1,6})(?:[\t ]+(.*))?$/);
  if (!match) return null;
  return {
    content: (match[2] ?? '').replace(/[\t ]+#+[\t ]*$/, ''),
    level: match[1].length,
  };
}

function isHorizontalRule(line: string): boolean {
  return /^ {0,3}(?:(?:\*[\t ]*){3,}|(?:-[\t ]*){3,}|(?:_[\t ]*){3,})$/.test(line);
}

function matchListItem(line: string): ListItemMatch | null {
  const unordered = line.match(/^ {0,3}[-+*](?:[\t ]+(.*))?$/);
  if (unordered) return { content: unordered[1] ?? '', ordered: false, start: 1 };

  const ordered = line.match(/^ {0,3}(\d{1,9})[.)](?:[\t ]+(.*))?$/);
  if (!ordered) return null;
  return { content: ordered[2] ?? '', ordered: true, start: Number.parseInt(ordered[1], 10) };
}

function matchBlockquote(line: string): string | null {
  const match = line.match(/^ {0,3}>[\t ]?(.*)$/);
  return match ? match[1] : null;
}

function splitTableRow(line: string): string[] | null {
  let source = line.trim();
  if (!source.includes('|')) return null;
  if (source.startsWith('|')) source = source.slice(1);
  if (source.endsWith('|') && !isEscaped(source, source.length - 1)) source = source.slice(0, -1);

  const cells: string[] = [];
  let cell = '';
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\\' && source[index + 1] === '|') {
      cell += '|';
      index += 1;
    } else if (source[index] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += source[index];
    }
  }
  cells.push(cell.trim());
  return cells.length >= 2 ? cells : null;
}

function matchTable(lines: readonly string[], cursor: number): MarkdownTableMatch | null {
  if (cursor + 1 >= lines.length) return null;
  const header = splitTableRow(lines[cursor]);
  const delimiter = splitTableRow(lines[cursor + 1]);
  if (!header || !delimiter || delimiter.length !== header.length) return null;
  if (!delimiter.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;

  const rows: string[][] = [];
  let nextCursor = cursor + 2;
  while (nextCursor < lines.length && lines[nextCursor].trim()) {
    const row = splitTableRow(lines[nextCursor]);
    if (!row) break;
    rows.push([...row, ...Array.from({ length: Math.max(0, header.length - row.length) }, () => '')].slice(0, header.length));
    nextCursor += 1;
  }
  return { header, rows, nextCursor };
}

function startsBlock(line: string): boolean {
  return Boolean(
    matchFence(line) || matchHeading(line) || isHorizontalRule(line) || matchListItem(line) || matchBlockquote(line) !== null,
  );
}

function renderHeading(content: string, level: number, key: string): ReactNode {
  const Heading = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  return (
    <Heading key={key} className={headingClasses[level - 1]}>
      {renderInline(content, `${key}-inline`)}
    </Heading>
  );
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let cursor = 0;
  let blockIndex = 0;

  const nextKey = (kind: string) => `${kind}-${blockIndex++}`;

  while (cursor < lines.length) {
    if (lines[cursor].trim() === '') {
      cursor += 1;
      continue;
    }

    const fence = matchFence(lines[cursor]);
    if (fence) {
      const key = nextKey('code');
      const codeLines: string[] = [];
      cursor += 1;
      while (cursor < lines.length && !closesFence(lines[cursor], fence)) {
        codeLines.push(lines[cursor]);
        cursor += 1;
      }
      if (cursor < lines.length) cursor += 1;
      blocks.push(
        <pre
          key={key}
          className="my-3 overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-zinc-100 p-3 text-sm leading-relaxed dark:bg-zinc-900"
        >
          <code className="font-mono">{codeLines.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = matchHeading(lines[cursor]);
    if (heading) {
      const key = nextKey('heading');
      blocks.push(renderHeading(heading.content, heading.level, key));
      cursor += 1;
      continue;
    }

    if (isHorizontalRule(lines[cursor])) {
      blocks.push(<hr key={nextKey('rule')} className="my-4 border-0 border-t border-zinc-300 dark:border-zinc-700" />);
      cursor += 1;
      continue;
    }

    const table = matchTable(lines, cursor);
    if (table) {
      const key = nextKey('table');
      blocks.push(
        <div key={key} className="my-3 overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-zinc-100 dark:bg-zinc-900">
              <tr>
                {table.header.map((cell, index) => (
                  <th key={`${key}-head-${index}`} className="border-b border-zinc-200 px-3 py-2 font-semibold dark:border-zinc-800">
                    {renderInline(cell, `${key}-head-${index}-inline`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={`${key}-row-${rowIndex}`} className="border-b border-zinc-100 last:border-b-0 dark:border-zinc-900">
                  {row.map((cell, cellIndex) => (
                    <td key={`${key}-cell-${rowIndex}-${cellIndex}`} className="px-3 py-2 align-top">
                      {renderInline(cell, `${key}-cell-${rowIndex}-${cellIndex}-inline`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      cursor = table.nextCursor;
      continue;
    }

    const firstListItem = matchListItem(lines[cursor]);
    if (firstListItem) {
      const key = nextKey(firstListItem.ordered ? 'ordered-list' : 'unordered-list');
      const items: string[][] = [];
      let currentItem: string[] | undefined;

      while (cursor < lines.length) {
        const item = matchListItem(lines[cursor]);
        if (item && item.ordered === firstListItem.ordered) {
          currentItem = [item.content];
          items.push(currentItem);
          cursor += 1;
          continue;
        }

        const continuation = lines[cursor].match(/^(?: {2,}|\t)(.*)$/);
        if (currentItem && continuation && lines[cursor].trim() !== '') {
          currentItem.push(continuation[1]);
          cursor += 1;
          continue;
        }
        break;
      }

      const listItems = items.map((itemLines, itemIndex) => (
        <li key={`${key}-item-${itemIndex}`} className="pl-1">
          {renderInline(itemLines.join('\n'), `${key}-item-${itemIndex}-inline`)}
        </li>
      ));

      blocks.push(
        firstListItem.ordered ? (
          <ol key={key} start={firstListItem.start} className="my-3 list-decimal space-y-1 pl-6">
            {listItems}
          </ol>
        ) : (
          <ul key={key} className="my-3 list-disc space-y-1 pl-6">
            {listItems}
          </ul>
        ),
      );
      continue;
    }

    const firstQuoteLine = matchBlockquote(lines[cursor]);
    if (firstQuoteLine !== null) {
      const key = nextKey('quote');
      const quoteLines = [firstQuoteLine];
      cursor += 1;
      while (cursor < lines.length) {
        const quoteLine = matchBlockquote(lines[cursor]);
        if (quoteLine === null) break;
        quoteLines.push(quoteLine);
        cursor += 1;
      }
      blocks.push(
        <blockquote
          key={key}
          className="my-3 border-l-4 border-zinc-300 pl-4 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
        >
          <p>{renderInline(quoteLines.join('\n'), `${key}-inline`)}</p>
        </blockquote>,
      );
      continue;
    }

    const key = nextKey('paragraph');
    const paragraphLines = [lines[cursor]];
    cursor += 1;
    while (cursor < lines.length && lines[cursor].trim() !== '' && !startsBlock(lines[cursor])) {
      paragraphLines.push(lines[cursor]);
      cursor += 1;
    }
    blocks.push(
      <p key={key} className="my-3 first:mt-0 last:mb-0">
        {renderInline(paragraphLines.join('\n'), `${key}-inline`)}
      </p>,
    );
  }

  return blocks;
}

export function MarkdownText({ text }: MarkdownTextProps) {
  return <div className="min-w-0 break-words leading-relaxed">{renderBlocks(text)}</div>;
}

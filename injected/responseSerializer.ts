const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'DD',
  'DETAILS',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'HEADER',
  'MAIN',
  'NAV',
  'P',
  'SECTION',
]);
const OMITTED_TAGS = new Set(['BUTTON', 'NOSCRIPT', 'SCRIPT', 'STYLE', 'SVG', 'TEMPLATE']);
const TABLE_SECTION_TAGS = new Set(['TBODY', 'TFOOT', 'THEAD']);

interface SerializationContext {
  protectedBlocks: string[];
}

export function serializeResponseText(root: Element): string {
  const context: SerializationContext = { protectedBlocks: [] };
  const serialized = normalizeDocument(serializeNode(root, context));
  return context.protectedBlocks.reduce(
    (text, block, index) => text.replace(protectedToken(index), block),
    serialized,
  );
}

function serializeNode(node: Node, context: SerializationContext): string {
  if (node.nodeType === TEXT_NODE) return normalizeText(node.textContent ?? '');
  const element = node as Element;
  if (node.nodeType !== ELEMENT_NODE && node.nodeType !== undefined) return '';
  if (typeof element.tagName !== 'string') return '';
  if (OMITTED_TAGS.has(tagName(element)) || attribute(element, 'aria-hidden') === 'true') return '';
  if (!element.childNodes) return normalizeText(element.textContent ?? '');

  const tag = tagName(element);
  if (tag === 'BR') return '\n';
  if (tag === 'HR') return block('---');
  if (tag === 'PRE') return block(protectCodeBlock(element, context));
  if (tag === 'TABLE') return block(tableToMarkdown(element));
  if (tag === 'UL' || tag === 'OL') return block(serializeList(element, tag === 'OL', context, 0));
  if (tag === 'BLOCKQUOTE') return block(serializeBlockquote(element, context));
  if (/^H[1-6]$/.test(tag)) {
    const content = serializeChildren(element, context).trim();
    return content ? block(`${'#'.repeat(Number(tag[1]))} ${content}`) : '';
  }

  const content = serializeChildren(element, context);
  if (tag === 'STRONG' || tag === 'B') return wrapInline(content, '**');
  if (tag === 'EM' || tag === 'I') return wrapInline(content, '*');
  if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') return wrapInline(content, '~~');
  if (tag === 'CODE') return inlineCode(element.textContent ?? content);
  if (tag === 'A') return serializeLink(element, content);
  if (tag === 'IMG' || tag === 'CANVAS' || tag === 'VIDEO') return '';
  if (tag === 'LI') return block(content);
  return BLOCK_TAGS.has(tag) ? block(content) : content;
}

function serializeChildren(element: Element, context: SerializationContext): string {
  let output = '';
  for (const child of Array.from(element.childNodes ?? [])) output += serializeNode(child, context);
  return output;
}

function serializeBlockquote(element: Element, context: SerializationContext): string {
  const content = normalizeDocument(serializeChildren(element, context));
  if (!content) return '';
  return content
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

function serializeList(element: Element, ordered: boolean, context: SerializationContext, depth: number): string {
  const items = directChildElements(element).filter((child) => tagName(child) === 'LI');
  return items
    .map((item, index) => serializeListItem(item, ordered ? `${index + 1}.` : '-', context, depth))
    .filter(Boolean)
    .join('\n');
}

function serializeListItem(item: Element, marker: string, context: SerializationContext, depth: number): string {
  let content = '';
  const nested: string[] = [];
  for (const child of Array.from(item.childNodes ?? [])) {
    if (child.nodeType === ELEMENT_NODE) {
      const childElement = child as Element;
      const childTag = tagName(childElement);
      if (childTag === 'UL' || childTag === 'OL') {
        const nestedList = serializeList(childElement, childTag === 'OL', context, depth + 1);
        if (nestedList) nested.push(nestedList);
        continue;
      }
    }
    content += serializeNode(child, context);
  }

  const indent = '  '.repeat(depth);
  const continuationIndent = `${indent}${' '.repeat(marker.length + 1)}`;
  const lines = normalizeDocument(content).split('\n').filter((line, index, all) => line || (index > 0 && index < all.length - 1));
  const first = lines.shift() ?? '';
  const output = [`${indent}${marker}${first ? ` ${first}` : ''}`];
  output.push(...lines.map((line) => `${continuationIndent}${line}`));
  output.push(...nested);
  return output.join('\n');
}

function tableToMarkdown(table: Element): string {
  const rows = tableRows(table)
    .map((row) => directChildElements(row).filter((cell) => ['TH', 'TD'].includes(tagName(cell))).map(tableCellText))
    .filter((row) => row.length > 0);
  if (rows.length === 0) return '';

  const width = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => '')]);
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  const [header, ...body] = normalizedRows;
  return [line(header), line(Array.from({ length: width }, () => '---')), ...body.map(line)].join('\n');
}

function tableRows(table: Element): Element[] {
  const rows: Element[] = [];
  const visit = (container: Element) => {
    for (const child of directChildElements(container)) {
      const tag = tagName(child);
      if (tag === 'TR') rows.push(child);
      else if (TABLE_SECTION_TAGS.has(tag)) visit(child);
    }
  };
  visit(table);
  return rows;
}

function tableCellText(cell: Element): string {
  const text = serializeTableCellChildren(cell).replace(/\s+/g, ' ').trim();
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function serializeTableCellChildren(element: Element): string {
  let output = '';
  for (const child of Array.from(element.childNodes ?? [])) {
    if (child.nodeType === TEXT_NODE) {
      output += child.textContent ?? '';
      continue;
    }
    const childElement = child as Element;
    if (child.nodeType !== ELEMENT_NODE || typeof childElement.tagName !== 'string') continue;
    const tag = tagName(childElement);
    if (OMITTED_TAGS.has(tag)) continue;
    if (tag === 'BR') output += ' ';
    else output += ` ${serializeTableCellChildren(childElement)} `;
  }
  return output;
}

function protectCodeBlock(element: Element, context: SerializationContext): string {
  const codeElement = firstDescendantByTag(element, 'CODE');
  const code = (codeElement?.textContent ?? element.textContent ?? '').replace(/\r\n?/g, '\n');
  const language = codeLanguage(codeElement ?? element);
  const longestFence = Math.max(0, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length));
  const fence = '`'.repeat(Math.max(3, longestFence + 1));
  const blockText = `${fence}${language ? language : ''}\n${code}${code.endsWith('\n') ? '' : '\n'}${fence}`;
  const index = context.protectedBlocks.push(blockText) - 1;
  return protectedToken(index);
}

function inlineCode(value: string): string {
  const code = value.replace(/\s*\n\s*/g, ' ');
  if (!code) return '';
  const longestFence = Math.max(0, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length));
  const fence = '`'.repeat(Math.max(1, longestFence + 1));
  const needsPadding = /^\s|\s$|^`|`$/.test(code);
  return `${fence}${needsPadding ? ' ' : ''}${code}${needsPadding ? ' ' : ''}${fence}`;
}

function serializeLink(element: Element, content: string): string {
  const label = normalizeText(element.textContent ?? content).trim();
  const href = safeHttpUrl(attribute(element, 'href'));
  if (!label) return href ?? '';
  if (!href || label === href) return label;
  const escapedLabel = label.replace(/(\\|\[|\])/g, '\\$1');
  const escapedHref = href.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20');
  return `[${escapedLabel}](${escapedHref})`;
}

function safeHttpUrl(value: string | undefined): string | undefined {
  if (!value || Array.from(value).some((character) => character.charCodeAt(0) <= 31)) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function codeLanguage(element: Element): string {
  const className = attribute(element, 'class') ?? '';
  const classMatch = className.match(/(?:^|\s)language-([\w+-]+)/i);
  const candidate = classMatch?.[1] ?? attribute(element, 'data-language') ?? '';
  return /^[\w+-]+$/.test(candidate) ? candidate : '';
}

function firstDescendantByTag(element: Element, wantedTag: string): Element | undefined {
  for (const child of directChildElements(element)) {
    if (tagName(child) === wantedTag) return child;
    const descendant = firstDescendantByTag(child, wantedTag);
    if (descendant) return descendant;
  }
  return undefined;
}

function directChildElements(element: Element): Element[] {
  return Array.from(element.childNodes ?? []).filter(
    (child): child is Element => child.nodeType === ELEMENT_NODE && typeof (child as Element).tagName === 'string',
  );
}

function wrapInline(content: string, marker: string): string {
  const leading = content.match(/^\s*/)?.[0] ?? '';
  const trailing = content.match(/\s*$/)?.[0] ?? '';
  const core = content.slice(leading.length, content.length - trailing.length);
  return core ? `${leading}${marker}${core}${marker}${trailing}` : content;
}

function block(content: string): string {
  const normalized = content.replace(/^\n+|\n+$/g, '');
  return normalized ? `\n\n${normalized}\n\n` : '';
}

function normalizeText(value: string): string {
  return value.replace(/[\t\r\n ]+/g, ' ');
}

function normalizeDocument(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line.trim() ? line.replace(/[\t ]+$/g, '') : ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function attribute(element: Element, name: string): string | undefined {
  try {
    return element.getAttribute?.(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function tagName(element: Element): string {
  return element.tagName.toUpperCase();
}

function protectedToken(index: number): string {
  return `\uE000MAC_PRE_${index}\uE001`;
}

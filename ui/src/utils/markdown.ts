/**
 * A deliberately small Markdown subset parser for assistant replies.
 *
 * Scope is "what the model actually emits into a chat bubble": paragraphs,
 * **bold**, *italic*, `inline code`, fenced code blocks, `-`/`1.` lists,
 * `#`-`###` headings, `>` quotes and links. Tables and nested lists are out of
 * scope on purpose -- they're where a hand-rolled parser turns into regex soup,
 * and the rail is too narrow to render them well anyway.
 *
 * This module is pure: it returns tokens, never JSX and never an HTML string.
 * Markdown.tsx builds React elements from these tokens, so assistant text is
 * escaped by React rather than trusted -- it can quote user-imported CSV
 * descriptions, so it's not content we control.
 */

export interface InlineToken {
  type: "text" | "bold" | "italic" | "code" | "link";
  value: string;
  /** Only set for `link`; already scheme-validated (see SAFE_LINK_SCHEMES). */
  href?: string;
}

export type Block =
  | { type: "paragraph"; spans: InlineToken[] }
  | { type: "heading"; level: 1 | 2 | 3; spans: InlineToken[] }
  | { type: "quote"; spans: InlineToken[] }
  | { type: "list"; ordered: boolean; items: InlineToken[][] }
  | { type: "code"; value: string };

const SAFE_LINK_SCHEMES = ["http://", "https://", "mailto:"];

// Ordered by precedence: a code span is matched before emphasis so that
// `**not bold**` inside backticks stays literal.
const INLINE_PATTERN =
  /`([^`]+)`|\*\*([\s\S]+?)\*\*|\*([^*\n]+)\*|__([^_\n]+)__|_([^_\n]+)_|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

const HEADING_PATTERN = /^(#{1,3})\s+(.*)$/;
const ORDERED_ITEM_PATTERN = /^\d+[.)]\s+(.*)$/;
const BULLET_ITEM_PATTERN = /^[-*+]\s+(.*)$/;
/** `*emphasis on its own line*` -- looks like a `*` bullet, isn't one. */
const WHOLE_LINE_EMPHASIS = /^\*[^*]+\*$/;

function isSafeHref(href: string): boolean {
  const lowered = href.trim().toLowerCase();
  return SAFE_LINK_SCHEMES.some((scheme) => lowered.startsWith(scheme));
}

function pushText(tokens: InlineToken[], value: string): void {
  if (value.length > 0) {
    tokens.push({ type: "text", value });
  }
}

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;

  INLINE_PATTERN.lastIndex = 0;
  let match = INLINE_PATTERN.exec(text);
  while (match !== null) {
    pushText(tokens, text.slice(lastIndex, match.index));

    const [raw, code, bold, italic, boldUnderscore, italicUnderscore, linkText, href] = match;
    if (code !== undefined) {
      tokens.push({ type: "code", value: code });
    } else if (bold !== undefined) {
      tokens.push({ type: "bold", value: bold });
    } else if (boldUnderscore !== undefined) {
      tokens.push({ type: "bold", value: boldUnderscore });
    } else if (italic !== undefined) {
      tokens.push({ type: "italic", value: italic });
    } else if (italicUnderscore !== undefined) {
      tokens.push({ type: "italic", value: italicUnderscore });
    } else if (linkText !== undefined && href !== undefined) {
      if (isSafeHref(href)) {
        tokens.push({ type: "link", value: linkText, href });
      } else {
        // Unsupported scheme (javascript:, data:, ...) -- keep the source text.
        pushText(tokens, raw);
      }
    }

    lastIndex = match.index + raw.length;
    match = INLINE_PATTERN.exec(text);
  }

  pushText(tokens, text.slice(lastIndex));
  return tokens;
}

function isBullet(line: string): boolean {
  if (!BULLET_ITEM_PATTERN.test(line)) {
    return false;
  }
  return !(line.startsWith("*") && WHOLE_LINE_EMPHASIS.test(line.trim()));
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", spans: parseInline(paragraph.join("\n")) });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    // Fenced code is consumed before anything else looks at these lines.
    if (trimmed.startsWith("```")) {
      flushParagraph();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        body.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: "code", value: body.join("\n") });
      continue;
    }

    if (trimmed === "") {
      flushParagraph();
      continue;
    }

    const heading = HEADING_PATTERN.exec(trimmed);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        spans: parseInline(heading[2]),
      });
      continue;
    }

    if (trimmed.startsWith("> ")) {
      flushParagraph();
      blocks.push({ type: "quote", spans: parseInline(trimmed.slice(2)) });
      continue;
    }

    const orderedFirst = ORDERED_ITEM_PATTERN.exec(trimmed);
    if (orderedFirst || isBullet(trimmed)) {
      flushParagraph();
      const ordered = orderedFirst !== null;
      const items: InlineToken[][] = [];
      while (i < lines.length) {
        const itemLine = lines[i].trim();
        const orderedMatch = ORDERED_ITEM_PATTERN.exec(itemLine);
        if (ordered && orderedMatch) {
          items.push(parseInline(orderedMatch[1]));
        } else if (!ordered && isBullet(itemLine)) {
          items.push(parseInline(itemLine.replace(BULLET_ITEM_PATTERN, "$1")));
        } else {
          break;
        }
        i += 1;
      }
      i -= 1;
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return blocks;
}

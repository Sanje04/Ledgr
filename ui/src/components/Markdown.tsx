import { Fragment } from "react";
import { parseMarkdown } from "../utils/markdown";
import type { Block, InlineToken } from "../utils/markdown";
import "../styles/Markdown.css";

export interface MarkdownProps {
  /** Raw assistant text; the supported subset is documented in utils/markdown.ts. */
  text: string;
  className?: string;
}

function renderInline(spans: InlineToken[]): JSX.Element[] {
  return spans.map((span, index) => {
    const key = `${span.type}-${index}`;
    switch (span.type) {
      case "bold":
        return <strong key={key}>{span.value}</strong>;
      case "italic":
        return <em key={key}>{span.value}</em>;
      case "code":
        return (
          <code key={key} className="markdown__code">
            {span.value}
          </code>
        );
      case "link":
        return (
          <a key={key} href={span.href} target="_blank" rel="noreferrer noopener">
            {span.value}
          </a>
        );
      default:
        return <Fragment key={key}>{span.value}</Fragment>;
    }
  });
}

function renderBlock(block: Block, index: number): JSX.Element {
  const key = `${block.type}-${index}`;
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3";
      return (
        <Tag key={key} className="markdown__heading">
          {renderInline(block.spans)}
        </Tag>
      );
    }
    case "quote":
      return (
        <blockquote key={key} className="markdown__quote">
          {renderInline(block.spans)}
        </blockquote>
      );
    case "code":
      return (
        <pre key={key} className="markdown__pre">
          <code>{block.value}</code>
        </pre>
      );
    case "list": {
      const items = block.items.map((item, itemIndex) => (
        <li key={itemIndex}>{renderInline(item)}</li>
      ));
      return block.ordered ? (
        <ol key={key} className="markdown__list">
          {items}
        </ol>
      ) : (
        <ul key={key} className="markdown__list">
          {items}
        </ul>
      );
    }
    default:
      return (
        <p key={key} className="markdown__paragraph">
          {renderInline(block.spans)}
        </p>
      );
  }
}

function Markdown({ text, className }: MarkdownProps): JSX.Element {
  const blocks = parseMarkdown(text);
  return (
    <div className={className ? `markdown ${className}` : "markdown"}>
      {blocks.map(renderBlock)}
    </div>
  );
}

export default Markdown;

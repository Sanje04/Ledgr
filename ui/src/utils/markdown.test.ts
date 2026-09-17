import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown";

describe("parseMarkdown", () => {
  it("parses a typical assistant reply into paragraphs, emphasis and a list", () => {
    const blocks = parseMarkdown(
      "You spent **$412.30** on *Dining* last month.\n\n- Groceries: $210\n- Transport: $84",
    );

    expect(blocks).toEqual([
      {
        type: "paragraph",
        spans: [
          { type: "text", value: "You spent " },
          { type: "bold", value: "$412.30" },
          { type: "text", value: " on " },
          { type: "italic", value: "Dining" },
          { type: "text", value: " last month." },
        ],
      },
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", value: "Groceries: $210" }],
          [{ type: "text", value: "Transport: $84" }],
        ],
      },
    ]);
  });

  it("hands the line that ends a list back to the block loop", () => {
    // The one bit of index arithmetic in the parser: a list run followed
    // immediately by prose, with no blank line between them.
    expect(parseMarkdown("- one\nThen this.")).toEqual([
      { type: "list", ordered: false, items: [[{ type: "text", value: "one" }]] },
      { type: "paragraph", spans: [{ type: "text", value: "Then this." }] },
    ]);
  });

  it("consumes a fenced code block without parsing the markdown inside it", () => {
    const blocks = parseMarkdown("Try:\n\n```\n**literal**\n```");

    expect(blocks[1]).toEqual({ type: "code", value: "**literal**" });
  });
});

describe("parseInline", () => {
  it("keeps emphasis inside a code span literal", () => {
    expect(parseInline("`**not bold**`")).toEqual([{ type: "code", value: "**not bold**" }]);
  });

  it("drops an unsafe link scheme back to plain text", () => {
    expect(parseInline("[click](javascript:alert)")).toEqual([
      { type: "text", value: "[click](javascript:alert)" },
    ]);
  });
});

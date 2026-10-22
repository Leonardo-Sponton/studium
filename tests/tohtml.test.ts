import { describe, expect, it } from "vitest";
import { markdownToHtml } from "../src/editor/toHtml";

describe("Markdown to HTML (PDF export)", () => {
  it("blocks and inline marks", async () => {
    const html = await markdownToHtml(
      "# Title\n\nSome **bold**, *it*, ~~gone~~, ==hl==, `code` and [link](https://x.org) #tag ^abc123\n\n- one\n- [x] done\n- [ ] open\n\n1. a\n2. b\n\n---\n\n> plain quote\n",
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>it</em>");
    expect(html).toContain("<s>gone</s>");
    expect(html).toContain("<mark>hl</mark>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="https://x.org">link</a>');
    expect(html).toContain('<span class="tag">#tag</span>');
    expect(html).not.toContain("^abc123");
    expect(html).toContain('<li class="task done"><p><span class="task-box">☑</span>');
    expect(html).toContain("<ol>");
    expect(html).toContain("<hr>");
    expect(html).toContain("<blockquote><p>plain quote</p></blockquote>");
  });

  it("callouts, tables, footnotes, math, comments, html", async () => {
    const html = await markdownToHtml(
      "> [!tip] Remember\n> inside **it**\n\n| a | b |\n| :-- | --: |\n| 1 | 2 |\n\nText[^1] and ^[inline note].\n\n[^1]: The note.\n\n$x^2$ %%secret%%\n\n<u>under</u> <script>bad()</script>\n",
    );
    expect(html).toContain('<div class="callout callout-tip"><div class="callout-title"><span class="callout-icon">✦</span> Remember</div><p>inside <strong>it</strong></p></div>');
    expect(html).toContain('<th style="text-align:left">a</th><th style="text-align:right">b</th>');
    expect(html).toContain("<td");
    expect(html).toContain('<sup class="fn"><a href="#fn-1">1</a></sup>');
    expect(html).toContain('<li id="fn-1">The note.</li>');
    expect(html).toContain('<li id="fn-2">inline note</li>');
    expect(html).toContain("katex");
    expect(html).not.toContain("secret");
    expect(html).toContain("<u>under</u>");
    expect(html).not.toContain("<script>");
  });

  it("embeds: pictures, drawings, notes", async () => {
    const html = await markdownToHtml("![[a.png|200]]\n\n![[Plan.excalidraw]]\n\n![[Other note#Part]]\n\n![[Missing]]\n", {
      image: async n => (n === "a.png" ? "blob:a" : null),
      drawing: async n => (n === "Plan.excalidraw" ? "<svg>plan</svg>" : null),
      note: async n => (n === "Other note" ? "# Intro\n\nx\n\n# Part\n\nThe *part*." : null),
    });
    expect(html).toContain('<img src="blob:a" alt="a.png" width="200">');
    expect(html).toContain('<div class="drawing"><svg>plan</svg></div>');
    expect(html).toContain('<div class="embed"><div class="embed-title">Other note › Part</div><h1>Part</h1><p>The <em>part</em>.</p></div>');
    expect(html).toContain('<span class="wikilink">Missing</span>');
  });

  it("code blocks keep their text", async () => {
    const html = await markdownToHtml("```\nif (a < b) {}\n```\n");
    expect(html).toContain("<pre class=\"code\"><code>if (a &lt; b) {}</code></pre>");
  });
});

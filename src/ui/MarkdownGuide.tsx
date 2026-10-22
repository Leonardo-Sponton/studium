import type { ReactNode } from "react";
import { Dialog } from "./Dialog";
import { mathHTML } from "../editor/render";
import { t } from "../i18n";

// A cheat sheet for the Markdown the editor understands: what to type, and how it looks.
// The results use the editor's own classes (cm-hm-*), so they look like they will in the note.

function Row({ src, children }: { src: string; children: ReactNode }) {
  return (
    <tr>
      <td className="mono md-src">{src}</td>
      <td>{children}</td>
    </tr>
  );
}

export function MarkdownGuide({ onClose }: { onClose(): void }) {
  const g = t.mdGuide;
  const [head, ...body] = g.table;
  const tableSrc = [head, head.map(() => "---"), ...body].map(r => `| ${r.join(" | ")} |`).join("\n");
  return (
    <Dialog title={g.title} onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        {g.intro}
      </p>
      <table className="md-guide">
        <thead>
          <tr>
            <th>{g.type}</th>
            <th>{g.get}</th>
          </tr>
        </thead>
        <tbody>
          <Row src={`# ${g.heading}`}>
            <span className="cm-hm-h1">{g.heading}</span>
          </Row>
          <Row src={`## ${g.subheading}`}>
            <span className="cm-hm-h2">{g.subheading}</span>
          </Row>
          <Row src={`**${g.bold}**`}>
            <span className="cm-hm-strong">{g.bold}</span>
          </Row>
          <Row src={`*${g.italic}*`}>
            <span className="cm-hm-em">{g.italic}</span>
          </Row>
          <Row src={`~~${g.strike}~~`}>
            <span className="cm-hm-strike">{g.strike}</span>
          </Row>
          <Row src={`==${g.highlight}==`}>
            <span className="cm-hm-hl">{g.highlight}</span>
          </Row>
          <Row src={`- ${g.list}`}>
            <span className="cm-hm-bullet">•</span> {g.list}
          </Row>
          <Row src={`1. ${g.numbered}`}>
            <span className="cm-hm-number">1.</span> {g.numbered}
          </Row>
          <Row src={`- [ ] ${g.todo}`}>
            <span className="cm-hm-check" /> {g.todo}
          </Row>
          <Row src={`- [x] ${g.done}`}>
            <span className="cm-hm-check done" /> <span className="cm-hm-done">{g.done}</span>
          </Row>
          <Row src={`> ${g.quote}`}>
            <span className="cm-hm-quote md-quote">{g.quote}</span>
          </Row>
          <Row src={`> [!tip] ${g.calloutTitle}\n> ${g.calloutText}`}>
            <span className="cm-hm-callout cm-hm-callout-tip md-quote">
              <span className="cm-hm-callout-title">{g.calloutTitle}</span>
              <br />
              {g.calloutText}
            </span>
          </Row>
          <Row src={`\`${g.code}\``}>
            <span className="cm-hm-code">{g.code}</span>
          </Row>
          <Row src={"```java\nint x = 1;\n```"}>
            <span className="cm-hm-code">
              <span className="cm-tk-kw">int</span> x = <span className="cm-tk-num">1</span>;
            </span>
            <span className="muted small"> {g.codeBlock}</span>
          </Row>
          <Row src={`[${g.link}](https://…)`}>
            <span className="cm-hm-link">{g.link}</span>
          </Row>
          <Row src={`#${g.tag}`}>
            <span className="cm-hm-tag">#{g.tag}</span>
          </Row>
          <Row src={`[[${g.wiki}]]`}>
            <span className="cm-hm-wiki">{g.wiki}</span>
            <span className="muted small"> {g.wikiHint}</span>
          </Row>
          <Row src={`[[${g.wiki}|${g.wikiAlias}]]`}>
            <span className="cm-hm-wiki">{g.wikiAlias}</span>
          </Row>
          <Row src={`![[${g.wiki}]]`}>
            <span className="muted small">{g.embedHint}</span>
          </Row>
          <Row src="![[foto.png|300]]">
            <span className="muted small">{g.imageHint}</span>
          </Row>
          <Row src="$x^2 + y^2$">
            <span className="cm-hm-math" dangerouslySetInnerHTML={{ __html: mathHTML("x^2 + y^2", false) }} />
          </Row>
          <Row src={"$$\n\\frac{a}{b}\n$$"}>
            <span className="cm-hm-math" dangerouslySetInnerHTML={{ __html: mathHTML("\\frac{a}{b}", true) }} />
          </Row>
          <Row src={"```mermaid\nflowchart LR\n  A --> B\n```"}>
            <span className="muted small">{g.diagramHint}</span>
          </Row>
          <Row src={`${g.footnoteWord}[^1]\n\n[^1]: ${g.footnoteText}`}>
            {g.footnoteWord}
            <sup className="cm-hm-fn">1</sup>
          </Row>
          <Row src={`%%${g.comment}%%`}>
            <span className="cm-hm-comment">{g.comment}</span>
          </Row>
          <Row src={`<u>${g.underline}</u>`}>
            <span className="cm-hm-html-u">{g.underline}</span>
          </Row>
          <Row src={`> [!faq]- ${g.foldTitle}\n> …`}>
            <span className="cm-hm-callout cm-hm-callout-warn md-quote">
              <span className="cm-hm-callout-title">▸ {g.foldTitle}</span>
            </span>
          </Row>
          <Row src="---">
            <span className="muted">{g.line}</span>
            <hr className="md-hr" />
          </Row>
        </tbody>
      </table>
      <h3 className="md-guide-h">{g.tableTitle}</h3>
      <pre className="mono md-src md-table-src">{tableSrc}</pre>
      <table className="md-table">
        <thead>
          <tr>
            {head.map(c => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map(r => (
            <tr key={r[0]}>
              {r.map(c => (
                <td key={c}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="muted small md-tips">
        {g.tips.map(tip => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" onClick={onClose}>
          {t.common.close}
        </button>
      </div>
    </Dialog>
  );
}

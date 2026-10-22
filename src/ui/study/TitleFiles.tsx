import { useState } from "react";
import { Dialog } from "../Dialog";
import { t } from "../../i18n";

// Files picked to add (PDFs, exercise lists, project files) are named here first: the title
// becomes the file name, so "scan_0231.pdf" can be kept as "List 3 — Functions.pdf".

export interface TitledFile {
  file: File;
  title: string;
}

const extOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
};
const stemOf = (name: string) => name.slice(0, name.length - extOf(name).length);

/** The file name for a title: the title plus the picked file's extension. */
export const titledName = (f: TitledFile) => `${f.title.trim()}${extOf(f.file.name).toLowerCase().replace(/^\.markdown$/, ".md")}`;

export function TitleFiles(props: { files: File[]; heading: string; onOk(list: TitledFile[]): void; onClose(): void }) {
  const [titles, setTitles] = useState(() => props.files.map(f => stemOf(f.name)));
  const ready = titles.every(x => x.trim());
  const ok = () => ready && props.onOk(props.files.map((file, i) => ({ file, title: titles[i].trim() })));
  return (
    <Dialog title={props.heading} onClose={props.onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        {t.study.titleFilesHint}
      </p>
      <div className="stack title-files" style={{ gap: 10 }}>
        {props.files.map((f, i) => (
          <label key={i} className="stack" style={{ gap: 4 }}>
            <span className="muted small mono title-files-name">{f.name}</span>
            <input
              className="field"
              autoFocus={i === 0}
              value={titles[i]}
              placeholder={t.study.fileTitle}
              aria-label={t.study.fileTitle}
              onFocus={e => e.target.select()}
              onChange={e => setTitles(titles.map((x, k) => (k === i ? e.target.value.replace(/[\\/]/g, "") : x)))}
              onKeyDown={e => e.key === "Enter" && ok()}
            />
          </label>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={props.onClose}>
          {t.common.cancel}
        </button>
        <button className="btn primary" disabled={!ready} onClick={ok}>
          {t.common.ok}
        </button>
      </div>
    </Dialog>
  );
}

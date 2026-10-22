import { useRef, useState } from "react";
import { ClipboardPaste, FilePlus, FileUp } from "lucide-react";
import { chaptersOf, importText, MATERIAL_KINDS, type MaterialKind } from "../../data/study";
import { Dialog } from "../Dialog";
import { t } from "../../i18n";

// Adding a material: the text comes from a .md file (the handout an AI wrote), pasted, or is
// written later. A title in the file's header or its first "# " heading fills the title in.

type How = "file" | "paste" | "empty";

export interface NewMaterialFields {
  title: string;
  kind: MaterialKind;
  source: string;
  url: string;
  body: string;
}

export function NewMaterial(props: { onOk(f: NewMaterialFields): void; onClose(): void }) {
  const [how, setHow] = useState<How>("file");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<MaterialKind>("handout");
  const [source, setSource] = useState("");
  const [url, setUrl] = useState("");
  const [body, setBody] = useState("");
  const [fileInfo, setFileInfo] = useState("");
  const titleTyped = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const take = (text: string, name = "") => {
    const r = importText(text, name);
    setBody(r.body);
    if (!titleTyped.current || !title.trim()) setTitle(r.title);
    return r;
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    const r = take(await f.text(), f.name);
    setFileInfo(t.study.imported(f.name, chaptersOf(r.body).length));
  };

  const ok = () => title.trim() && props.onOk({ title, kind, source, url, body: how === "empty" ? "" : body });
  const hows: { id: How; icon: React.ReactNode; label: string }[] = [
    { id: "file", icon: <FileUp size={16} />, label: t.study.importFile },
    { id: "paste", icon: <ClipboardPaste size={16} />, label: t.study.pasteText },
    { id: "empty", icon: <FilePlus size={16} />, label: t.study.startEmpty },
  ];

  return (
    <Dialog title={t.study.addMaterial} onClose={props.onClose}>
      <div className="chips" style={{ padding: 0, flexWrap: "wrap" }} role="radiogroup" aria-label={t.study.content}>
        {hows.map(h => (
          <button key={h.id} role="radio" aria-checked={how === h.id} className={`chip${how === h.id ? " active" : ""}`} onClick={() => setHow(h.id)}>
            {h.icon} {h.label}
          </button>
        ))}
      </div>
      {how === "file" && (
        <div className="row">
          <input ref={input} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden onChange={e => pickFile(e.target.files?.[0])} />
          <button className="btn" onClick={() => input.current?.click()}>
            <FileUp size={16} /> {t.study.chooseFile}
          </button>
          {fileInfo && <span className="muted small">{fileInfo}</span>}
        </div>
      )}
      {how === "paste" && (
        <textarea
          className="field paste-area"
          rows={6}
          value={body}
          placeholder={t.study.pasteHere}
          onChange={e => setBody(e.target.value)}
          onBlur={() => body && take(body)}
        />
      )}
      <input
        className="field"
        value={title}
        placeholder={t.study.fTitle}
        aria-label={t.study.fTitle}
        onChange={e => {
          titleTyped.current = true;
          setTitle(e.target.value);
        }}
      />
      <select className="field" value={kind} aria-label={t.study.fKind} onChange={e => setKind(e.target.value as MaterialKind)}>
        {MATERIAL_KINDS.map(k => (
          <option key={k} value={k}>
            {t.study.kinds[k]}
          </option>
        ))}
      </select>
      <input className="field" value={source} placeholder={t.study.fSource} aria-label={t.study.fSource} onChange={e => setSource(e.target.value)} />
      <input className="field" value={url} placeholder={t.study.fUrl} aria-label={t.study.fUrl} inputMode="url" onChange={e => setUrl(e.target.value)} />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn" onClick={props.onClose}>
          {t.common.cancel}
        </button>
        <button className="btn primary" disabled={!title.trim()} onClick={ok}>
          {t.common.ok}
        </button>
      </div>
    </Dialog>
  );
}

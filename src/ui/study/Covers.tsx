import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { imageURL } from "../../data/attachments";
import { slugify } from "../../data/dates";
import { CENTERED, frameOf, loadCovers, loadGroupFrames, ZOOM_MAX, type CoverFrame } from "../../data/study";
import { useApp } from "../context";
import { Dialog } from "../Dialog";
import { t } from "../../i18n";

// Group covers (study/_covers): the pictures, made small on the way in, and the cover itself, a
// picture or the name's first letter on a color of its own. Used by the Personal home, a group's
// page and a subject's page (its own cover, or else its group's).
// A cover URL may end in "#frame=x,y,zoom" (data/study CoverFrame): how it is framed travels with
// the URL, so every place that passes a cover along shows it framed the same way.

/** A cover URL carrying its frame ("" frame = centered). */
export const withFrame = (url: string, frame?: string) => (url && frame ? `${url}#frame=${frame.replace(/ /g, ",")}` : url);

/** A cover URL split into the picture and its frame. */
export function splitFrame(url: string): { src: string; frame: CoverFrame } {
  const i = url.indexOf("#frame=");
  if (i < 0) return { src: url, frame: CENTERED };
  return { src: url.slice(0, i), frame: frameOf(url.slice(i + 7).replace(/,/g, " ")) ?? CENTERED };
}

/** Group covers as picture URLs, by group slug. */
export function useCovers(): Record<string, string> {
  const { notes, version } = useApp();
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      const frames = await loadGroupFrames(notes).catch(() => ({}) as Record<string, string>);
      for (const [slug, path] of Object.entries(await loadCovers(notes.storage))) {
        const url = await imageURL(notes.storage, path).catch(() => null);
        if (url) out[slug] = withFrame(url, frames[slug]);
      }
      if (alive) setUrls(out);
    })().catch(() => alive && setUrls({}));
    return () => {
      alive = false;
    };
  }, [notes, version]);
  return urls;
}

const COVER_WIDTH = 1200;

/** A picked picture made small enough for a cover (a phone photo can be several MB). */
export async function coverData(file: File): Promise<{ ext: string; data: Uint8Array }> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, COVER_WIDTH / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, "image/jpeg", 0.85));
    if (blob) return { ext: ".jpg", data: new Uint8Array(await blob.arrayBuffer()) };
  } catch {
    // Kept as it came.
  }
  const ext = (/\.(jpe?g|png|webp|gif|avif)$/i.exec(file.name)?.[0] ?? "").toLowerCase();
  if (!ext) throw new Error(t.study.coverNotPicture);
  return { ext, data: new Uint8Array(await file.arrayBuffer()) };
}

/** The picture inside a cover box, framed: the frame's point stays put while it zooms. */
function Framed({ src, frame }: { src: string; frame: CoverFrame }) {
  const at = `${frame.x}% ${frame.y}%`;
  return <img className="cover-img" src={src} alt="" draggable={false} style={{ objectPosition: at, transformOrigin: at, transform: `scale(${frame.zoom})` }} />;
}

/** A cover: the picture, or the group's first letter on a color of its own. */
export function Cover(props: { url?: string; name: string; className: string }) {
  const hue = [...slugify(props.name || "-")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  if (props.url) {
    const { src, frame } = splitFrame(props.url);
    return (
      <span className={`${props.className} cover-box`}>
        <Framed src={src} frame={frame} />
      </span>
    );
  }
  return (
    <span className={`${props.className} no-cover`} style={{ "--cover-hue": hue } as React.CSSProperties}>
      <span>{(props.name || "·").slice(0, 1).toUpperCase()}</span>
    </span>
  );
}

/**
 * "Adjust cover": drag the picture to pick what shows, zoom with the slider (or the wheel), and see
 * it as a banner and as a card. Arrow keys move it too, + and - zoom.
 */
export function CoverAdjust(props: {
  url: string;
  /** Shown like this banner (a selector), so the preview crops the same way; 3:1 when not on screen. */
  banner: string;
  /** The card's width / height. */
  card: number;
  onSave(f: CoverFrame): void;
  onClose(): void;
}) {
  const { src, frame: start } = splitFrame(props.url);
  const [aspect] = useState(() => {
    const r = document.querySelector(props.banner)?.getBoundingClientRect();
    return r && r.width && r.height ? Math.min(5, Math.max(1.5, r.width / r.height)) : 3;
  });
  const [f, setF] = useState<CoverFrame>(start);
  // A new picture (just picked, still loading when this opened) starts from its own frame.
  useEffect(() => setF(start), [src]); // eslint-disable-line react-hooks/exhaustive-deps
  const drag = useRef<{ x: number; y: number; from: CoverFrame } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const set = (n: Partial<CoverFrame>) =>
    setF(o => ({ x: clamp(n.x ?? o.x, 0, 100), y: clamp(n.y ?? o.y, 0, 100), zoom: clamp(n.zoom ?? o.zoom, 1, ZOOM_MAX) }));
  // Dragging right shows more of the left side; a bigger zoom moves less per pixel.
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const r = box.current?.getBoundingClientRect();
    if (!d || !r) return;
    set({ x: d.from.x - ((e.clientX - d.x) / r.width) * (100 / d.from.zoom), y: d.from.y - ((e.clientY - d.y) / r.height) * (100 / d.from.zoom) });
  };
  const key = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    const k: Record<string, Partial<CoverFrame>> = {
      ArrowLeft: { x: f.x - step },
      ArrowRight: { x: f.x + step },
      ArrowUp: { y: f.y - step },
      ArrowDown: { y: f.y + step },
      "+": { zoom: f.zoom + 0.1 },
      "=": { zoom: f.zoom + 0.1 },
      "-": { zoom: f.zoom - 0.1 },
    };
    if (!k[e.key]) return;
    e.preventDefault();
    set(k[e.key]);
  };
  // On body: it can open from inside another dialog (a subject's settings).
  return createPortal(
    <Dialog title={t.study.adjustCover} onClose={props.onClose}>
      <p className="list-meta" style={{ whiteSpace: "normal" }}>{t.study.adjustCoverHint}</p>
      <div
        ref={box}
        className="cover-adjust cover-box"
        style={{ aspectRatio: String(aspect) }}
        tabIndex={0}
        role="img"
        aria-label={t.study.adjustCoverHint}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, from: f };
        }}
        onPointerMove={move}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={e => set({ zoom: f.zoom - Math.sign(e.deltaY) * 0.1 })}
        onKeyDown={key}
      >
        <Framed src={src} frame={f} />
      </div>
      <label className="row cover-zoom">
        <span>{t.study.coverZoom}</span>
        <input type="range" min={1} max={ZOOM_MAX} step={0.05} value={f.zoom} onChange={e => set({ zoom: Number(e.target.value) })} />
      </label>
      <div className="row cover-adjust-previews">
        <span className="list-meta">{t.study.coverAsCard}</span>
        <span className="cover-adjust-card cover-box" style={{ aspectRatio: String(props.card) }}>
          <Framed src={src} frame={f} />
        </span>
      </div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <button className="btn ghost" onClick={() => setF(CENTERED)}>
          {t.study.coverCenter}
        </button>
        <span className="row" style={{ gap: 8 }}>
          <button className="btn ghost" onClick={props.onClose}>
            {t.common.cancel}
          </button>
          <button className="btn primary" onClick={() => props.onSave(f)}>
            {t.common.save}
          </button>
        </span>
      </div>
    </Dialog>,
    document.body,
  );
}

/** A picture file of the data folder as a URL ("" while loading, or with no path), with its frame. */
export function useImage(path: string, frame?: string): string {
  const { notes, version } = useApp();
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    if (!path) return setUrl("");
    imageURL(notes.storage, path).then(
      u => alive && setUrl(u ?? ""),
      () => alive && setUrl(""),
    );
    return () => {
      alive = false;
    };
  }, [notes, version, path]);
  return withFrame(url, frame);
}

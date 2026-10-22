import { useEffect, useState } from "react";
import { imageURL } from "../../data/attachments";
import { slugify } from "../../data/dates";
import { loadCovers } from "../../data/study";
import { useApp } from "../context";
import { t } from "../../i18n";

// Group covers (study/_covers): the pictures, made small on the way in, and the cover itself, a
// picture or the name's first letter on a color of its own. Used by the Personal home, a group's
// page and a subject's page (the cover of its group).

/** Group covers as picture URLs, by group slug. */
export function useCovers(): Record<string, string> {
  const { notes, version } = useApp();
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const [slug, path] of Object.entries(await loadCovers(notes.storage))) {
        const url = await imageURL(notes.storage, path).catch(() => null);
        if (url) out[slug] = url;
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

/** A cover: the picture, or the group's first letter on a color of its own. */
export function Cover(props: { url?: string; name: string; className: string }) {
  const hue = [...slugify(props.name || "-")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return props.url ? (
    <span className={props.className} style={{ backgroundImage: `url("${props.url}")` }} />
  ) : (
    <span className={`${props.className} no-cover`} style={{ "--cover-hue": hue } as React.CSSProperties}>
      <span>{(props.name || "·").slice(0, 1).toUpperCase()}</span>
    </span>
  );
}


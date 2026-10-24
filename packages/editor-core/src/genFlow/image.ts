// Input pictures are re-encoded in the browser before they leave it (ADR 0017 §10; MODELING-PLAN §7.2 G-d): decoded
// by the browser (its own orientation applied), drawn into an `OffscreenCanvas` and written again as PNG — the one
// type both providers take (Tripo takes no WebP, M7-GC-2). The new file carries pixels only: no EXIF, GPS, XMP or
// camera data (the gateway refuses files that still carry them, M7-GB-8). Large pictures are scaled down to 2,048
// pixels on the long side (providers work from far less; a 2k PNG stays well under the 20 MB upload limit); pictures
// under 64 pixels on a side are refused. Works in pages and workers (no DOM); Node has neither API and refuses.
import { GEN_TEXT } from './text';

export interface ReencodedImage {
  readonly name: string;
  readonly png: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** The long side a re-encoded picture keeps at most. */
export const REENCODE_MAX_SIDE = 2048;
/** The short side a picture needs at least (the gateway refuses smaller, M7-GB-8). */
export const REENCODE_MIN_SIDE = 64;

interface BitmapLike {
  readonly width: number;
  readonly height: number;
  close?(): void;
}
interface Canvas2d {
  drawImage(image: BitmapLike, x: number, y: number, w: number, h: number): void;
  imageSmoothingQuality?: string;
}
interface OffscreenLike {
  getContext(kind: '2d'): Canvas2d | null;
  convertToBlob(opts: { readonly type: string }): Promise<Blob>;
}
type ImageApis = {
  readonly createImageBitmap?: (image: Blob, opts?: Record<string, unknown>) => Promise<BitmapLike>;
  readonly OffscreenCanvas?: new (w: number, h: number) => OffscreenLike;
};

export class ReencodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReencodeError';
  }
}

/** The size a picture is written at: its own, or scaled to `REENCODE_MAX_SIDE` on the long side. */
export function reencodeSize(width: number, height: number): { readonly width: number; readonly height: number } {
  const scale = Math.min(1, REENCODE_MAX_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Re-encodes a picked file as a metadata-free PNG (see the header). */
export async function reencodeImage(file: Blob, name: string): Promise<ReencodedImage> {
  const apis = globalThis as unknown as ImageApis;
  if (apis.createImageBitmap === undefined || apis.OffscreenCanvas === undefined) {
    throw new ReencodeError(GEN_TEXT.cannotRead);
  }
  let bitmap: BitmapLike;
  try {
    bitmap = await apis.createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ReencodeError(GEN_TEXT.cannotRead);
  }
  try {
    if (Math.min(bitmap.width, bitmap.height) < REENCODE_MIN_SIDE) throw new ReencodeError(GEN_TEXT.tooSmall);
    const size = reencodeSize(bitmap.width, bitmap.height);
    const canvas = new apis.OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext('2d');
    if (context === null) throw new ReencodeError(GEN_TEXT.cannotRead);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const png = new Uint8Array(await blob.arrayBuffer());
    const base = name.replace(/\.[^.]*$/, '') || 'picture';
    return { name: `${base}.png`, png, width: size.width, height: size.height };
  } finally {
    bitmap.close?.();
  }
}

/**
 * Minimal JPEG EXIF reader — just enough to recover the camera focal length
 * so perspective rectification doesn't have to guess the lens.
 *
 * No dependencies; safe on any ArrayBuffer (returns undefined on anything
 * that isn't a JPEG with EXIF).
 */

export interface ExifCameraInfo {
  /** 35 mm-equivalent focal length (mm), if the camera wrote it. */
  focalLength35mm?: number;
  /** Physical focal length (mm). Without sensor size this can't give px alone. */
  focalLengthMm?: number;
  /** EXIF orientation tag (1–8). Browsers already apply this when displaying. */
  orientation?: number;
}

/** Parse EXIF from JPEG bytes. Returns {} when nothing usable is found. */
export function readExifCameraInfo(buf: ArrayBuffer): ExifCameraInfo {
  try {
    return parse(new DataView(buf));
  } catch {
    return {};
  }
}

/**
 * Focal length in pixels for a photo as displayed (EXIF orientation already
 * applied by the browser). The 35 mm frame is 36 mm along its long side, so
 * fPx = f35 / 36 × long-side-px. Returns undefined when EXIF lacks the tag.
 */
export function focalPxFromExif(
  info: ExifCameraInfo,
  imageWidthPx: number,
  imageHeightPx: number,
): number | undefined {
  const f35 = info.focalLength35mm;
  if (!f35 || !Number.isFinite(f35) || f35 <= 0) return undefined;
  const longSide = Math.max(imageWidthPx, imageHeightPx);
  if (!(longSide > 0)) return undefined;
  return (f35 / 36) * longSide;
}

/** Convenience: JPEG bytes + displayed size → focal length in pixels. */
export function estimateFocalPxFromJpeg(
  buf: ArrayBuffer,
  imageWidthPx: number,
  imageHeightPx: number,
): number | undefined {
  return focalPxFromExif(readExifCameraInfo(buf), imageWidthPx, imageHeightPx);
}

const TAG_ORIENTATION = 0x0112;
const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_FOCAL_LENGTH = 0x920a;
const TAG_FOCAL_LENGTH_35MM = 0xa405;

function parse(view: DataView): ExifCameraInfo {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {}; // not JPEG

  // Walk JPEG segments looking for APP1/Exif
  let off = 2;
  let tiffStart = -1;
  while (off + 4 <= view.byteLength) {
    if (view.getUint8(off) !== 0xff) break;
    const marker = view.getUint8(off + 1);
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      off += 2;
      continue;
    }
    const size = view.getUint16(off + 2);
    if (marker === 0xe1 && size >= 8 + 6) {
      // "Exif\0\0"
      if (
        view.getUint32(off + 4) === 0x45786966 &&
        view.getUint16(off + 8) === 0x0000
      ) {
        tiffStart = off + 10;
        break;
      }
    }
    if (marker === 0xda) break; // start of scan — no EXIF ahead
    off += 2 + size;
  }
  if (tiffStart < 0 || tiffStart + 8 > view.byteLength) return {};

  const endian = view.getUint16(tiffStart);
  const little = endian === 0x4949;
  if (!little && endian !== 0x4d4d) return {};
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  if (u16(tiffStart + 2) !== 0x002a) return {};

  const out: ExifCameraInfo = {};
  const readIfd = (ifdOff: number, depth: number): void => {
    if (depth > 2) return;
    const base = tiffStart + ifdOff;
    if (base + 2 > view.byteLength) return;
    const count = u16(base);
    for (let i = 0; i < count; i++) {
      const e = base + 2 + i * 12;
      if (e + 12 > view.byteLength) break;
      const tag = u16(e);
      const type = u16(e + 2);
      if (tag === TAG_ORIENTATION && (type === 3 || type === 1)) {
        out.orientation = u16(e + 8);
      } else if (tag === TAG_FOCAL_LENGTH_35MM && type === 3) {
        out.focalLength35mm = u16(e + 8);
      } else if (tag === TAG_FOCAL_LENGTH && type === 5) {
        const ro = tiffStart + u32(e + 8);
        if (ro + 8 <= view.byteLength) {
          const den = u32(ro + 4);
          if (den) out.focalLengthMm = u32(ro) / den;
        }
      } else if (tag === TAG_EXIF_IFD_POINTER && (type === 4 || type === 3)) {
        readIfd(u32(e + 8), depth + 1);
      }
    }
  };
  readIfd(u32(tiffStart + 4), 0);
  return out;
}

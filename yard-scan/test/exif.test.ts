import { describe, expect, it } from "vitest";
import {
  focalPxFromExif,
  readExifCameraInfo,
} from "../src/exif";

/** Build a minimal JPEG APP1/EXIF buffer with the given tags. */
function syntheticJpegWithExif(opts: {
  orientation?: number;
  focal35?: number;
  littleEndian?: boolean;
}): ArrayBuffer {
  const little = opts.littleEndian ?? true;
  const entries: { tag: number; type: number; value: number }[] = [];
  if (opts.orientation != null) {
    entries.push({ tag: 0x0112, type: 3, value: opts.orientation });
  }
  const exifEntries: { tag: number; type: number; value: number }[] = [];
  if (opts.focal35 != null) {
    exifEntries.push({ tag: 0xa405, type: 3, value: opts.focal35 });
  }
  if (exifEntries.length) {
    entries.push({ tag: 0x8769, type: 4, value: 0 }); // pointer patched below
  }

  const ifd0Size = 2 + entries.length * 12 + 4;
  const exifIfdOff = 8 + ifd0Size;
  const exifIfdSize = exifEntries.length ? 2 + exifEntries.length * 12 + 4 : 0;
  const tiffLen = 8 + ifd0Size + exifIfdSize;

  const buf = new ArrayBuffer(2 + 2 + 2 + 6 + tiffLen + 2);
  const v = new DataView(buf);
  let o = 0;
  v.setUint16(o, 0xffd8); o += 2; // SOI
  v.setUint16(o, 0xffe1); o += 2; // APP1
  v.setUint16(o, 2 + 6 + tiffLen); o += 2; // segment size
  v.setUint32(o, 0x45786966); o += 4; // "Exif"
  v.setUint16(o, 0x0000); o += 2;
  const tiff = o;
  v.setUint16(tiff, little ? 0x4949 : 0x4d4d);
  v.setUint16(tiff + 2, 0x002a, little);
  v.setUint32(tiff + 4, 8, little); // IFD0 offset

  const writeIfd = (
    at: number,
    list: { tag: number; type: number; value: number }[],
  ) => {
    v.setUint16(at, list.length, little);
    list.forEach((e, i) => {
      const eo = at + 2 + i * 12;
      v.setUint16(eo, e.tag, little);
      v.setUint16(eo + 2, e.type, little);
      v.setUint32(eo + 4, 1, little); // count
      const val = e.tag === 0x8769 ? exifIfdOff : e.value;
      if (e.type === 3) v.setUint16(eo + 8, val, little);
      else v.setUint32(eo + 8, val, little);
    });
    v.setUint32(at + 2 + list.length * 12, 0, little); // next IFD
  };
  writeIfd(tiff + 8, entries);
  if (exifEntries.length) writeIfd(tiff + exifIfdOff, exifEntries);
  v.setUint16(buf.byteLength - 2, 0xffd9); // EOI
  return buf;
}

describe("readExifCameraInfo", () => {
  it("reads 35mm focal length and orientation (little-endian)", () => {
    const buf = syntheticJpegWithExif({ orientation: 6, focal35: 26 });
    const info = readExifCameraInfo(buf);
    expect(info.orientation).toBe(6);
    expect(info.focalLength35mm).toBe(26);
  });

  it("reads big-endian TIFF too", () => {
    const buf = syntheticJpegWithExif({ focal35: 28, littleEndian: false });
    expect(readExifCameraInfo(buf).focalLength35mm).toBe(28);
  });

  it("returns {} for a JFIF-only JPEG (EXIF stripped)", () => {
    const v = new DataView(new ArrayBuffer(32));
    v.setUint16(0, 0xffd8);
    v.setUint16(2, 0xffe0); // APP0/JFIF
    v.setUint16(4, 16);
    expect(readExifCameraInfo(v.buffer)).toEqual({});
  });

  it("returns {} for garbage bytes", () => {
    expect(readExifCameraInfo(new ArrayBuffer(3))).toEqual({});
    expect(readExifCameraInfo(new Uint8Array([1, 2, 3, 4]).buffer)).toEqual({});
  });
});

describe("focalPxFromExif", () => {
  it("scales 35mm-equivalent focal to pixels along the long side", () => {
    // 26mm equiv on a 2160×2880 photo → 26/36 × 2880 = 2080 px
    const f = focalPxFromExif({ focalLength35mm: 26 }, 2160, 2880);
    expect(f).toBeCloseTo((26 / 36) * 2880, 6);
    // orientation-independent: swapped dims give the same answer
    expect(focalPxFromExif({ focalLength35mm: 26 }, 2880, 2160)).toBe(f);
  });

  it("returns undefined without the tag", () => {
    expect(focalPxFromExif({}, 2160, 2880)).toBeUndefined();
  });
});

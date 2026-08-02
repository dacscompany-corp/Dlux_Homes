"use client";

import { needsTranscode } from "./validateImageFile";

// Client-side image downscaling for every guest-facing photo upload (valid IDs,
// payment proofs).
//
// WHY THIS EXISTS: photos are sent to /api/bookings as base64 inside one JSON
// body, and base64 inflates bytes by ~33%. Vercel rejects any serverless request
// body over 4.5 MB with a 413 whose body is NOT JSON — so `res.json()` threw and
// the checkout page reported "Network error. Please check your connection",
// blaming the guest's internet for what was really an oversized upload. A single
// modern phone photo (3–5 MB) was enough to trip it.
//
// Downscaling to ~1600px / ~JPEG q0.8 puts a typical ID photo at 150–400 KB, so
// a full booking (several IDs + proof) stays comfortably under the limit — and
// uploads far faster on mobile data, which also avoids function timeouts.

// Longest edge kept after downscaling. Plenty of detail to read an ID card.
const MAX_DIMENSION = 1600;
// Per-image ceiling. Below this we stop re-encoding at lower quality.
//
// Sized from the WORST-CASE booking, not a typical one. Online bookings cap at
// 4 counted pax and IDs are required for guests 10+, so a full booking can carry
// 4 guests × 2 photos (front + back) + 1 payment proof = 9 images in ONE request.
// Base64 inflates each by a third, so the usable ~3.8 MB budget divides to
// ~420 KB encoded / ~320 KB decoded per photo. At 1600px this is still a clean,
// fully legible ID — the text is what matters, not the megapixels.
const MAX_BYTES = 320 * 1024;
// Small files are passed through untouched — re-encoding a 200 KB GCash receipt
// screenshot to JPEG would only make it blurrier.
const PASSTHROUGH_BYTES = 350 * 1024;

// Listing/property photos are displayed full-width, so they get a larger budget
// than an ID snapshot — still small enough that a batch upload fits one request.
export const GALLERY_PRESET = { maxDimension: 2200, maxBytes: 1_000_000 };

export type CompressOptions = { maxDimension?: number; maxBytes?: number };

export { needsTranscode };

// Approximate decoded byte size of a data URL (base64 is 4 chars per 3 bytes).
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  return Math.floor((b64.length * 3) / 4);
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
}

// Decode to a drawable bitmap. `createImageBitmap` honours EXIF orientation
// (phones store portrait shots rotated), so prefer it; fall back to <img> for
// older in-app browsers such as the Messenger webview on legacy Android.
async function decode(file: File): Promise<{ src: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { src: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
    } catch {
      /* fall through to the <img> path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not decode the image."));
      el.src = url;
    });
    return {
      src: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      done: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/**
 * Read an image File as a downscaled base64 data URL, ready to POST.
 *
 * Never throws for image reasons: if the browser can't decode or canvas is
 * unavailable, it falls back to the original file's data URL so the guest can
 * still submit (the payload guard at submit time catches anything oversized).
 */
export async function fileToCompressedDataUrl(file: File, opts: CompressOptions = {}): Promise<string> {
  const maxDimension = opts.maxDimension ?? MAX_DIMENSION;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;

  // HEIC/HEIF must be re-encoded no matter how small it is: the server sniffs
  // magic bytes and has no HEIC branch, so raw HEIC would be silently dropped
  // (the booking saves with NO ID photo attached and the guest still sees
  // "submitted"). Better to fail loudly here than lose the document.
  const mustTranscode = needsTranscode(file);

  if (!mustTranscode && file.size <= Math.min(PASSTHROUGH_BYTES, maxBytes)) return readAsDataUrl(file);

  let handle: Awaited<ReturnType<typeof decode>> | null = null;
  try {
    handle = await decode(file);
    const { src, width, height } = handle;
    if (!width || !height) {
      if (mustTranscode) throw new Error("unreadable");
      return readAsDataUrl(file);
    }

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    let w = Math.max(1, Math.round(width * scale));
    let h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (mustTranscode) throw new Error("no canvas");
      return readAsDataUrl(file);
    }

    const render = (quality: number): string => {
      canvas.width = w;
      canvas.height = h;
      // Transparent PNGs would otherwise flatten onto black in JPEG.
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(src, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", quality);
    };

    // Step quality down, then dimensions, until the image fits the ceiling.
    let out = render(0.82);
    for (const q of [0.7, 0.6, 0.5]) {
      if (dataUrlBytes(out) <= maxBytes) break;
      out = render(q);
    }
    let guard = 0;
    while (dataUrlBytes(out) > maxBytes && Math.max(w, h) > 900 && guard++ < 3) {
      w = Math.max(1, Math.round(w * 0.75));
      h = Math.max(1, Math.round(h * 0.75));
      out = render(0.6);
    }

    // iOS Safari returns a stub "data:," when a canvas exceeds its memory budget
    // instead of throwing — silently producing an unusable upload. Verify we got
    // real JPEG output before trusting it.
    if (!out.startsWith("data:image/jpeg")) {
      if (mustTranscode) throw new Error("encode failed");
      return readAsDataUrl(file);
    }

    // Some already-optimised uploads compress worse as JPEG — keep the smaller.
    // Never for HEIC: the original bytes are unusable server-side.
    if (mustTranscode) return out;
    const original = await readAsDataUrl(file);
    return dataUrlBytes(out) < dataUrlBytes(original) ? out : original;
  } catch (err) {
    // A HEIC we cannot convert must surface as an error — returning the raw file
    // would mean a booking submitted with a missing ID and nobody the wiser.
    if (mustTranscode) throw err instanceof Error ? err : new Error("transcode failed");
    return readAsDataUrl(file);
  } finally {
    handle?.done();
  }
}

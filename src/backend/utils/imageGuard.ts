// Server-side image validation for user-uploaded photos (QR codes, payment
// receipts, valid IDs, haven photos, profile pictures).
//
// A client-side `accept="image/*"` is only a hint — it can be bypassed, and a
// malicious file can be renamed to *.png with a spoofed MIME type. So we verify
// the actual file *signature* (magic bytes) here, on the server, before anything
// is stored. This is the real enforcement layer; the client checks are UX only.
//
// NOTE: document/contract uploads (PDFs) intentionally do NOT use this guard.

export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

// Identify an image by its leading bytes. Returns the detected MIME, or null if
// the buffer is not one of the supported raster formats.
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return "image/png";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString("ascii", 0, 6))) return "image/gif";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

type ImageCheck = { ok: true; mime: string } | { ok: false; reason: string };

function checkBuffer(buf: Buffer): ImageCheck {
  if (buf.length === 0) return { ok: false, reason: "Empty file" };
  if (buf.length > MAX_IMAGE_BYTES) return { ok: false, reason: `Image exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit` };
  const mime = sniffImageMime(buf);
  if (!mime) return { ok: false, reason: "File is not a supported image (JPEG, PNG, GIF, or WebP)" };
  return { ok: true, mime };
}

// Validate a base64 data URL (`data:<mime>;base64,<data>`) is a real image.
export function validateImageDataUrl(dataUrl: string): ImageCheck {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!m) return { ok: false, reason: "Not a base64 image data URL" };
  let buf: Buffer;
  try {
    buf = Buffer.from(m[2], "base64");
  } catch {
    return { ok: false, reason: "Invalid base64 data" };
  }
  return checkBuffer(buf);
}

// Validate a multipart File object (from formData) is a real image.
export async function validateImageFile(file: File): Promise<ImageCheck> {
  const buf = Buffer.from(await file.arrayBuffer());
  return checkBuffer(buf);
}

// ---------------------------------------------------------------------------
// Document / media uploads (contracts, payout evidence, amenity-verification
// video). These are INTENTIONALLY not image-only, but they must still have a
// validation floor: previously they only checked the string began with "data:"
// — no size cap, no type restriction — so an oversized or executable payload
// (a renamed .html/.svg/.exe) uploaded fine. This enforces a size limit and a
// MIME allow-list by magic bytes where cheaply possible, without requiring the
// caller to know the exact format.

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024; // 25 MB

// MIME prefixes we accept for document/media slots. Deliberately broad (PDFs,
// images, common video) but excludes text/html, svg, and application/*script.
const ALLOWED_DOC_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

type DocCheck = { ok: true; mime: string } | { ok: false; reason: string };

// Validate a base64 data URL destined for a document/media slot: enforce the
// size cap and that its declared MIME is in the allow-list. (Unlike images we
// don't have magic-byte sniffers for every format, so we trust the declared
// MIME for type — but the allow-list still blocks html/svg/script payloads, and
// the size cap always applies to the decoded bytes.)
export function validateDocumentDataUrl(dataUrl: string): DocCheck {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]+)$/.exec(dataUrl.trim());
  if (!m) return { ok: false, reason: "Not a valid data URL" };
  const mime = m[1].toLowerCase().trim();
  const isBase64 = !!m[2];

  if (!ALLOWED_DOC_MIME.includes(mime)) {
    return { ok: false, reason: `File type "${mime}" is not allowed` };
  }

  let byteLength: number;
  if (isBase64) {
    try {
      byteLength = Buffer.from(m[3], "base64").length;
    } catch {
      return { ok: false, reason: "Invalid base64 data" };
    }
  } else {
    byteLength = Buffer.byteLength(decodeURIComponent(m[3]));
  }

  if (byteLength === 0) return { ok: false, reason: "Empty file" };
  if (byteLength > MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: `File exceeds the ${MAX_DOCUMENT_BYTES / (1024 * 1024)}MB limit` };
  }

  // If it happens to be an image MIME, verify the bytes really are that image
  // (defends against an executable renamed with an image MIME). Non-image types
  // (pdf/video) pass on the allow-list + size check.
  if (mime.startsWith("image/") && isBase64) {
    const sniff = sniffImageMime(Buffer.from(m[3], "base64"));
    if (!sniff) return { ok: false, reason: "File claims to be an image but isn't" };
  }

  return { ok: true, mime };
}

// Client-side guard for photo upload buttons. This is UX only — it gives the
// user immediate feedback and keeps obvious non-images from being sent. The real
// enforcement lives on the server (src/backend/utils/imageGuard.ts), which
// verifies the file signature and can't be bypassed.

export const MAX_IMAGE_MB = 10;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// iPhones shoot HEIC by default. iOS only auto-converts to JPEG when the file
// input's `accept` list names concrete types — with `accept="image/*"` it hands
// over the raw HEIC, which is in neither our allow-list nor the server's
// magic-byte sniffer. Guests would be told "please choose an image file" while
// looking straight at their photo. We accept it here because every upload is
// re-encoded to JPEG in the browser before it is sent (see compressImage.ts).
const CONVERTIBLE_TYPES = ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];
const CONVERTIBLE_EXT = /\.(heic|heif)$/i;

// True when the browser must transcode this file before it can be uploaded.
// Some iOS versions report an EMPTY type for HEIC, so the extension is checked too.
export function needsTranscode(file: File): boolean {
  return CONVERTIBLE_TYPES.includes(file.type.toLowerCase()) || CONVERTIBLE_EXT.test(file.name);
}

// Message shown when a picked photo cannot be decoded for upload.
//
// Deliberately short, device-neutral, and free of instructions. Earlier versions
// named a phone brand (which is wrong half the time — an Android guest was told
// to change iPhone camera settings) and asked the guest to go screenshot their
// own photo. Handing someone a chore in the middle of checkout, after they have
// already sent payment, is not an acceptable answer. HEIC now converts
// automatically, so this only fires for a genuinely unreadable file — and the
// only useful thing to say then is "use a different one".
export const PHOTO_READ_ERROR = "We couldn't open that photo. Please pick a different one, or retake it with your camera.";

// Returns a human-readable error message if the file is not an acceptable image,
// or null if it passes.
export function imageFileError(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type) && !needsTranscode(file)) {
    return "Please choose an image file (JPEG, PNG, GIF, or WebP).";
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    return `Image must be under ${MAX_IMAGE_MB}MB.`;
  }
  return null;
}

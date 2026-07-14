// Client-side guard for photo upload buttons. This is UX only — it gives the
// user immediate feedback and keeps obvious non-images from being sent. The real
// enforcement lives on the server (src/backend/utils/imageGuard.ts), which
// verifies the file signature and can't be bypassed.

export const MAX_IMAGE_MB = 10;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// Returns a human-readable error message if the file is not an acceptable image,
// or null if it passes.
export function imageFileError(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Please choose an image file (JPEG, PNG, GIF, or WebP).";
  }
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
    return `Image must be under ${MAX_IMAGE_MB}MB.`;
  }
  return null;
}

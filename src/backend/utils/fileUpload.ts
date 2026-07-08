import { upload_file } from './cloudinary';
import { sniffImageMime, MAX_IMAGE_BYTES } from './imageGuard';

export const upload_image_from_form = async (
  file: File,
  folder: string
): Promise<{ public_id: string; url: string }> => {
  try {
    // Convert File to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Security: verify this is a real image by its file signature, not by the
    // client-supplied MIME type (which can be spoofed). Reject anything else.
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`Image exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)}MB limit`);
    }
    const detectedMime = sniffImageMime(buffer);
    if (!detectedMime) {
      throw new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed');
    }

    // Convert buffer to base64
    const base64 = buffer.toString('base64');

    // Create data URL using the detected (verified) MIME type
    const dataUrl = `data:${detectedMime};base64,${base64}`;

    // Upload to Cloudinary
    const result = await upload_file(dataUrl, folder);

    return result;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error(`Failed to upload file: ${error}`);
  }
};

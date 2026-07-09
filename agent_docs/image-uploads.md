# Photo upload validation

Any new photo upload path (payment proof, valid IDs, checklist photos, etc.) must validate on the **server**, not just the client — `accept="image/*"` and client MIME checks are spoofable by a renamed file.

- Server enforcement: `src/backend/utils/imageGuard.ts` — checks the actual file signature (magic bytes), not the declared MIME. `upload_image_from_form` in `fileUpload.ts` already runs this.
- Client-side (`src/lib/validateImageFile.ts`) is UX-only, to fail fast before upload.
- Exceptions — do not force image-only: partner contracts/documents and payout evidence (PDFs), amenity verifications (also accepts video).
- To display an uploaded image, reuse `src/components/ImageThumb.tsx` (clickable thumbnail → opens full image in a new tab) rather than building a new preview component.

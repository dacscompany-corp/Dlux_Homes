"use client";

// Clickable image preview used across modules that accept photo uploads (payment
// QR codes, payment receipts, valid IDs, etc.) so staff and guests can SEE the
// uploaded image and click it to open the full-size version in a new tab and
// verify it's correct. Renders nothing when there's no image.
type Props = {
  src?: string | null;
  alt: string;
  size?: number;
  rounded?: number;
};

export default function ImageThumb({ src, alt, size = 44, rounded = 8 }: Props) {
  if (!src) return null;
  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      title="Click to view full image"
      style={{
        display: "inline-block",
        lineHeight: 0,
        borderRadius: rounded,
        overflow: "hidden",
        border: "1px solid #ece5d4",
        cursor: "zoom-in",
        flex: "none",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} style={{ width: size, height: size, objectFit: "cover", display: "block" }} />
    </a>
  );
}

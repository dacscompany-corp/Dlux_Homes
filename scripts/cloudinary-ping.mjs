import { v2 as cloudinary } from "cloudinary";
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
console.log("cloud:", process.env.CLOUDINARY_CLOUD_NAME, "| key:", String(process.env.CLOUDINARY_API_KEY).slice(0,4)+"…");
try {
  const r = await cloudinary.api.ping();
  console.log("PING:", r.status, "✅ credentials VALID");
} catch (e) {
  console.log("PING FAILED ❌:", e?.error?.http_code || e?.http_code || "", e?.error?.message || e?.message);
}

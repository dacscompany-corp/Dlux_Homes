import cloudinary from 'cloudinary';

cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const isCloudinaryConfigured = (): boolean =>
    !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const upload_file = (
    file: string,
    folder: string
):Promise<{ public_id: string; url: string }> => {
    return new Promise((resolve, reject) => {
        // Cloudinary not set up yet — skip the upload gracefully so booking /
        // employee / report flows don't fail. Activates automatically once the
        // CLOUDINARY_* env vars are provided.
        if (!isCloudinaryConfigured()) {
            console.warn("[cloudinary] not configured — skipping upload (no image URL stored)");
            resolve({ public_id: "", url: "" });
            return;
        }
        cloudinary.v2.uploader.upload(
            file,
            {
                resource_type: "auto",
                folder: folder,
            },
            (error: unknown, result: unknown) => {
                // Non-fatal: an upload failure (bad credentials, network, etc.) must
                // not roll back the haven / booking / report that triggered it. We log
                // and resolve empty so the caller simply stores no image URL. Callers
                // filter out empty results before persisting.
                if (error) {
                    const e = error as { message?: string; http_code?: number };
                    console.warn(`[cloudinary] upload failed (${e?.http_code || ""} ${e?.message || ""}) — skipping image`);
                    resolve({ public_id: "", url: "" });
                    return;
                }
                const r = result as { public_id?: string; url?: string } | null;
                if (!r || !r.public_id || !r.url) {
                    console.warn("[cloudinary] upload returned no URL — skipping image");
                    resolve({ public_id: "", url: "" });
                    return;
                }
                resolve({
                    public_id: r.public_id,
                    url: r.url,
                });
            }
        )
    });
}

const delete_file = async (file: string): Promise<boolean> => {
    const res = await cloudinary.v2.uploader.destroy(file);

    if (res?.result === "ok") {
        return true;
    }
    return false;
}

export { upload_file, delete_file, cloudinary};
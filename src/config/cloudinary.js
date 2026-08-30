const cloudinary = require('cloudinary').v2;
const env = require('./env');

if (env.CLOUDINARY_URL) {
  cloudinary.config({ cloudinary_url: env.CLOUDINARY_URL });
} else if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET
  });
}

function hasCloudinaryConfig() {
  return Boolean(
    env.CLOUDINARY_URL ||
    (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET)
  );
}

/**
 * Uploads data URL or image buffer to Cloudinary, returning clean metadata and HTTPS URL
 */
async function uploadToCloudinary(dataUrlOrPath, folder = 'aceit_spikers') {
  if (!dataUrlOrPath || typeof dataUrlOrPath !== 'string') {
    return { success: false, url: '' };
  }
  const trimmed = dataUrlOrPath.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return { success: true, url: trimmed };
  }
  if (!trimmed.startsWith('data:image/')) {
    return { success: true, url: trimmed };
  }
  if (!hasCloudinaryConfig()) {
    return { success: true, url: trimmed };
  }
  try {
    const res = await cloudinary.uploader.upload(trimmed, {
      folder,
      resource_type: 'auto',
      overwrite: true
    });
    return {
      success: true,
      url: res.secure_url || res.url,
      public_id: res.public_id,
      format: res.format,
      width: res.width,
      height: res.height,
      bytes: res.bytes
    };
  } catch (err) {
    console.error('[Cloudinary Upload Error]', err.message);
    return { success: false, url: trimmed, error: err.message };
  }
}

module.exports = {
  cloudinary,
  hasCloudinaryConfig,
  uploadToCloudinary
};

require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  MONGODB_URI: process.env.MONGODB_URI || '',
  JWT_SECRET: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'spikers_dev_jwt_secret_key_2026'),
  ADMIN_PIN: process.env.ADMIN_PIN || '2026',
  OWNER_USERNAME: (process.env.OWNER_USERNAME || 'founder').toLowerCase().trim(),
  OWNER_PASSWORD: process.env.OWNER_PASSWORD || 'OwnerSecret123!',
  CLOUDINARY_URL: process.env.CLOUDINARY_URL || '',
  CLOUDINARY_CLOUD_NAME: (process.env.CLOUDINARY_CLOUD_NAME || '').trim(),
  CLOUDINARY_API_KEY: (process.env.CLOUDINARY_API_KEY || '').trim(),
  CLOUDINARY_API_SECRET: (process.env.CLOUDINARY_API_SECRET || '').trim(),
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean)
};

function validateConfig() {
  if (env.NODE_ENV === 'production') {
    if (!env.MONGODB_URI) {
      console.warn('[Env Warning] MONGODB_URI is not set for production environment.');
    }
    if (!env.JWT_SECRET) {
      console.error('[Env Error] JWT_SECRET is required in production.');
    }
  }
}

validateConfig();

module.exports = env;

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  env: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'vcare-dev-secret',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  apiKey: process.env.VCARE_API_KEY || 'vcare-integration-key-2026',
  isDev: process.env.NODE_ENV !== 'production',
};

import 'dotenv/config';
import './lib/ensureDatabaseUrl.js';
import app from './app.js';
import { config } from './config/index.js';

function validateStartup() {
  const warnings = [];

  if (config.env === 'production') {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-me-in-production') {
      console.error('FATAL: Set SESSION_SECRET in production.');
      process.exit(1);
    }
    if ((process.env.SESSION_STORE || 'mysql') === 'memory') {
      console.error('FATAL: SESSION_STORE=memory is not allowed in production.');
      process.exit(1);
    }
    if (!process.env.DATABASE_URL?.startsWith('mysql://')) {
      console.error('FATAL: Set DATABASE_URL to a mysql:// connection string.');
      process.exit(1);
    }
  } else if (!process.env.SESSION_SECRET) {
    warnings.push('SESSION_SECRET not set — using dev default.');
  }

  for (const msg of warnings) console.warn(`⚠ ${msg}`);
}

validateStartup();

app.listen(config.port, () => {
  console.log(`
  ╔══════════════════════════════════════════════════╗
  ║           VCare Clinic Process ERP               ║
  ║           Server-rendered Enterprise Platform    ║
  ╠══════════════════════════════════════════════════╣
  ║  URL:  http://localhost:${config.port}                    ║
  ║  Env:  ${config.env.padEnd(38)}║
  ╚══════════════════════════════════════════════════╝
  `);
});

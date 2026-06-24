export const DEMO_PASSWORD = 'VCare@123';

/** Demo accounts for development quick-login (one per role). */
export const demoLogins = [
  { label: 'Super Admin', email: 'admin@vcare.com' },
  { label: 'Branch Manager', email: 'bm.hair@vcare.com' },
  { label: 'Consultant', email: 'dr.sharma@vcare.com' },
  { label: 'Call Center', email: 'cc.agent@vcare.com' },
  { label: 'Corporate', email: 'corporate@vcare.com' },
  { label: 'Accounts', email: 'accounts@vcare.com' },
  { label: 'Warehouse', email: 'warehouse@vcare.com' },
  { label: 'Pharmacist', email: 'pharmacist@vcare.com' },
].map((entry) => ({ ...entry, password: DEMO_PASSWORD }));

import { execSync } from 'child_process';

console.log('--- Initializing FiberOS Production Startup (PostgreSQL) ---');

try {
  console.log('Ensuring PostgreSQL database schema is synchronized...');
  execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });

  console.log('Checking initial Nextcloud snapshot migration (only if DB is empty)...');
  execSync('node scripts/restore-from-nextcloud.mjs', { stdio: 'inherit' });

  console.log('Checking database seed (only if DB is still empty)...');
  execSync('node scripts/seed-if-empty.mjs', { stdio: 'inherit' });

  console.log('Running weighted items & sitelist metadata check...');
  execSync('node scripts/migrate-weighted-items.mjs', { stdio: 'inherit' });

  console.log('Ensuring default FiberOS user accounts...');
  execSync('node scripts/seed-users.mjs', { stdio: 'inherit' });
} catch (err) {
  console.error('Database initialization warning:', err.message);
}

console.log('Starting Next.js Server...');
execSync('next start', { stdio: 'inherit' });

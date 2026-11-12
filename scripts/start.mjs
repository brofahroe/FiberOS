import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('--- Initializing FiberOS Production Startup ---');

try {
  // If a volume is mounted at /data or /app/data, ensure the directory exists
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('file:')) {
    const dbPath = process.env.DATABASE_URL.replace('file:', '');
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      console.log(`Creating database directory: ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  console.log('Ensuring database schema is synchronized...');
  execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });

  console.log('Checking database seed...');
  execSync('node scripts/seed-if-empty.mjs', { stdio: 'inherit' });
} catch (err) {
  console.error('Database initialization warning:', err.message);
}

console.log('Starting Next.js Server...');
execSync('next start', { stdio: 'inherit' });


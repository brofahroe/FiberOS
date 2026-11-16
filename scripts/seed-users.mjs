import crypto from 'crypto';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

const DEFAULT_ACCOUNTS = [
  {
    username: 'Admin',
    fullName: 'Administrator',
    jobTitle: 'Administrator',
    role: 'ADMIN',
    password: 'Admin123',
    mustChangePassword: false,
  },
  {
    username: 'Kamal',
    fullName: 'Kamal',
    jobTitle: 'Pengawas Lapangan',
    role: 'USER',
    password: 'Password123',
    mustChangePassword: true,
  },
  {
    username: 'Sigit',
    fullName: 'Sigit',
    jobTitle: 'Pengawas Lapangan',
    role: 'USER',
    password: 'Password123',
    mustChangePassword: true,
  },
  {
    username: 'Fahrudin',
    fullName: 'Fahrudin',
    jobTitle: 'Pengawas Lapangan',
    role: 'USER',
    password: 'Password123',
    mustChangePassword: true,
  },
  {
    username: 'Yanuar',
    fullName: 'Yanuar',
    jobTitle: 'Pengawas Lapangan',
    role: 'USER',
    password: 'Password123',
    mustChangePassword: true,
  },
  {
    username: 'Danang',
    fullName: 'Danang',
    jobTitle: 'Pengawas Lapangan',
    role: 'USER',
    password: 'Password123',
    mustChangePassword: true,
  },
];

async function main() {
  console.log('--- Ensuring default FiberOS users in database ---');
  const existing = await prisma.user.findMany({ select: { username: true } });
  const existingSet = new Set(existing.map((u) => u.username.trim().toLowerCase()));

  let createdCount = 0;
  for (const acc of DEFAULT_ACCOUNTS) {
    if (existingSet.has(acc.username.toLowerCase())) continue;
    await prisma.user.create({
      data: {
        username: acc.username,
        fullName: acc.fullName,
        jobTitle: acc.jobTitle,
        role: acc.role,
        passwordHash: hashPassword(acc.password),
        mustChangePassword: acc.mustChangePassword,
      },
    });
    console.log(`Created default user: ${acc.username} (${acc.role})`);
    createdCount++;
  }

  console.log(`--- Default users check finished (${createdCount} created) ---`);
}

main()
  .catch((err) => {
    console.error('Error seeding users:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

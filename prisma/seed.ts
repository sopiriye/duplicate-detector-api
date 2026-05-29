import 'dotenv/config';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { MerchantStatus, PrismaClient, UserRole } from '@prisma/client';

const scrypt = promisify(scryptCallback);

interface SeedMerchant {
  businessName: string;
  email: string;
  phoneNumber: string;
  cacNumber: string;
  address: string;
  status: MerchantStatus;
}

interface SeedAdmin {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

const SEEDED_MERCHANT_PASSWORD = 'StrongPassword123';
const SEEDED_ADMIN: SeedAdmin = {
  firstName: 'Seed',
  lastName: 'Admin',
  email: 'admin@similarmatch.local',
  password: 'AdminSeed123!',
};

const SEEDED_MERCHANTS: SeedMerchant[] = [
  {
    businessName: 'Beta Foods Limited',
    email: 'betafoods.ltd@example.com',
    phoneNumber: '+2348010000001',
    cacNumber: 'RC1000001',
    address: '12 Marina Road, Lagos',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'BetaFoods Ltd',
    email: 'betafoods.compact@example.com',
    phoneNumber: '+2348010000002',
    cacNumber: 'RC1000002',
    address: '14 Marina Road, Lagos',
    status: MerchantStatus.PENDING_REVIEW,
  },
  {
    businessName: 'Beta Foods Nigeria Limited',
    email: 'betafoods.nigeria@example.com',
    phoneNumber: '+2348010000003',
    cacNumber: 'RC1000003',
    address: '15 Apapa Wharf, Lagos',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Beta Agro Services',
    email: 'betaagro@example.com',
    phoneNumber: '+2348010000004',
    cacNumber: 'RC1000004',
    address: '22 Ibadan Expressway, Oyo',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Alpha Retail Nigeria',
    email: 'alpharetail.ng@example.com',
    phoneNumber: '+2348010000005',
    cacNumber: 'RC1000005',
    address: '8 Allen Avenue, Ikeja',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Alpha Retail Nig Ltd',
    email: 'alpharetail.nig@example.com',
    phoneNumber: '+2348010000006',
    cacNumber: 'RC1000006',
    address: '9 Allen Avenue, Ikeja',
    status: MerchantStatus.PENDING_REVIEW,
  },
  {
    businessName: 'Alpha Logistics Services',
    email: 'alphalogistics@example.com',
    phoneNumber: '+2348010000007',
    cacNumber: 'RC1000007',
    address: '4 Creek Road, Port Harcourt',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Green Energy Solutions',
    email: 'greenenergy@example.com',
    phoneNumber: '+2348010000008',
    cacNumber: 'RC1000008',
    address: '17 Admiralty Way, Lekki',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Green Energy Nigeria',
    email: 'greenenergy.ng@example.com',
    phoneNumber: '+2348010000009',
    cacNumber: 'RC1000009',
    address: '19 Admiralty Way, Lekki',
    status: MerchantStatus.PENDING_REVIEW,
  },
  {
    businessName: 'Green Agro Services',
    email: 'greenagro@example.com',
    phoneNumber: '+2348010000010',
    cacNumber: 'RC1000010',
    address: '11 Secretariat Road, Enugu',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Zenith Tech Services',
    email: 'zenithtech@example.com',
    phoneNumber: '+2348010000011',
    cacNumber: 'RC1000011',
    address: '23 Isaac John Street, GRA Ikeja',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Zenith Technologies Ltd',
    email: 'zenithtechnologies@example.com',
    phoneNumber: '+2348010000012',
    cacNumber: 'RC1000012',
    address: '25 Isaac John Street, GRA Ikeja',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Zenith Insurance Brokers',
    email: 'zenithinsurance@example.com',
    phoneNumber: '+2348010000013',
    cacNumber: 'RC1000013',
    address: '5 Ahmadu Bello Way, Victoria Island',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Delta Medical Supplies',
    email: 'deltamedical@example.com',
    phoneNumber: '+2348010000014',
    cacNumber: 'RC1000014',
    address: '31 Aba Road, Port Harcourt',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Delta Med Supply Nig',
    email: 'deltamedsupply@example.com',
    phoneNumber: '+2348010000015',
    cacNumber: 'RC1000015',
    address: '33 Aba Road, Port Harcourt',
    status: MerchantStatus.PENDING_REVIEW,
  },
  {
    businessName: 'Delta Marine Logistics',
    email: 'deltamarine@example.com',
    phoneNumber: '+2348010000016',
    cacNumber: 'RC1000016',
    address: '7 Wharf Road, Warri',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Prime Water Enterprises',
    email: 'primewater@example.com',
    phoneNumber: '+2348010000017',
    cacNumber: 'RC1000017',
    address: '10 Ring Road, Benin City',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Prime Waters Nigeria',
    email: 'primewaters.ng@example.com',
    phoneNumber: '+2348010000018',
    cacNumber: 'RC1000018',
    address: '12 Ring Road, Benin City',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Prime Water Engineering',
    email: 'primewaterengineering@example.com',
    phoneNumber: '+2348010000019',
    cacNumber: 'RC1000019',
    address: '45 Ikorodu Road, Lagos',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Nova Build Limited',
    email: 'novabuild@example.com',
    phoneNumber: '+2348010000020',
    cacNumber: 'RC1000020',
    address: '18 Sani Abacha Way, Kano',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Nova Builders Nig',
    email: 'novabuilders@example.com',
    phoneNumber: '+2348010000021',
    cacNumber: 'RC1000021',
    address: '20 Sani Abacha Way, Kano',
    status: MerchantStatus.PENDING_REVIEW,
  },
  {
    businessName: 'Nova Health Services',
    email: 'novahealth@example.com',
    phoneNumber: '+2348010000022',
    cacNumber: 'RC1000022',
    address: '6 Hospital Road, Abuja',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Sunrise Bakery Ltd',
    email: 'sunrisebakery@example.com',
    phoneNumber: '+2348010000023',
    cacNumber: 'RC1000023',
    address: '13 Emir Road, Kaduna',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Sunrise Bakers Nigeria',
    email: 'sunrisebakers@example.com',
    phoneNumber: '+2348010000024',
    cacNumber: 'RC1000024',
    address: '15 Emir Road, Kaduna',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Sunrise Solar Services',
    email: 'sunrisesolar@example.com',
    phoneNumber: '+2348010000025',
    cacNumber: 'RC1000025',
    address: '2 Tafawa Balewa Road, Jos',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Capital Farms Ltd',
    email: 'capitalfarms@example.com',
    phoneNumber: '+2348010000026',
    cacNumber: 'RC1000026',
    address: '4 Old Airport Road, Abuja',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Capital Farm Produce Nigeria',
    email: 'capitalfarmproduce@example.com',
    phoneNumber: '+2348010000027',
    cacNumber: 'RC1000027',
    address: '6 Old Airport Road, Abuja',
    status: MerchantStatus.VERIFIED,
  },
  {
    businessName: 'Capital Finance Advisory',
    email: 'capitalfinance@example.com',
    phoneNumber: '+2348010000028',
    cacNumber: 'RC1000028',
    address: '9 Broad Street, Lagos',
    status: MerchantStatus.VERIFIED,
  },
];

function normalizeBusinessName(businessName: string): string {
  // Seed normalization flow:
  // Mirror the app's normalization logic so seeded merchants participate in duplicate detection with the same canonical naming rules.
  return businessName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(
      /\b(limited|ltd|plc|company|co|inc|incorporated|enterprise|enterprises|services?)\b/g,
      ' ',
    )
    .replace(/\b(the|and)\b/g, ' ')
    .replace(/\bnig\b/g, ' nigeria ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function hashPassword(password: string): Promise<string> {
  // Seed hashing flow:
  // Create a stored password hash that matches the application login format so seeded merchants can authenticate when verified.
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function seedAdmin(prisma: PrismaClient): Promise<void> {
  // Admin seed flow:
  // Create a predictable admin account so seeded merchants can be reviewed through protected admin routes immediately.
  const passwordHash = await hashPassword(SEEDED_ADMIN.password);

  await prisma.user.upsert({
    where: { email: SEEDED_ADMIN.email },
    update: {
      firstName: SEEDED_ADMIN.firstName,
      lastName: SEEDED_ADMIN.lastName,
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
    create: {
      firstName: SEEDED_ADMIN.firstName,
      lastName: SEEDED_ADMIN.lastName,
      email: SEEDED_ADMIN.email,
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });
}

async function main(): Promise<void> {
  // Seed preflight flow:
  // Validate database configuration and construct a Prisma client that uses the same PostgreSQL driver adapter as the app runtime.
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const prisma = new PrismaClient({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    adapter: new PrismaPg(databaseUrl),
  });

  try {
    // Seed identity flow:
    // Create the reusable admin account first so the seeded dataset is immediately usable for admin review scenarios.
    await seedAdmin(prisma);

    // Seed persistence flow:
    // Upsert merchant auth users and merchant profiles so the seed command is repeatable across local environments.
    for (const seedMerchant of SEEDED_MERCHANTS) {
      const email = seedMerchant.email.trim().toLowerCase();
      const passwordHash = await hashPassword(SEEDED_MERCHANT_PASSWORD);

      const user = await prisma.user.upsert({
        where: { email },
        update: {
          passwordHash,
          role: UserRole.MERCHANT,
          isActive: true,
        },
        create: {
          email,
          passwordHash,
          role: UserRole.MERCHANT,
          isActive: true,
        },
        select: { id: true },
      });

      await prisma.merchant.upsert({
        where: { userId: user.id },
        update: {
          businessName: seedMerchant.businessName,
          normalizedBusinessName: normalizeBusinessName(
            seedMerchant.businessName,
          ),
          businessEmail: email,
          phoneNumber: seedMerchant.phoneNumber,
          cacNumber: seedMerchant.cacNumber,
          address: seedMerchant.address,
          status: seedMerchant.status,
          verifiedAt:
            seedMerchant.status === MerchantStatus.VERIFIED ? new Date() : null,
          rejectedAt: null,
          rejectionReason: null,
        },
        create: {
          userId: user.id,
          businessName: seedMerchant.businessName,
          normalizedBusinessName: normalizeBusinessName(
            seedMerchant.businessName,
          ),
          businessEmail: email,
          phoneNumber: seedMerchant.phoneNumber,
          cacNumber: seedMerchant.cacNumber,
          address: seedMerchant.address,
          status: seedMerchant.status,
          verifiedAt:
            seedMerchant.status === MerchantStatus.VERIFIED ? new Date() : null,
        },
      });
    }

    // Seed completion flow:
    // Report the seeded account summary so local testers know the command populated the expected credentials and dataset size.
    console.log(
      `Seed completed successfully with 1 admin and ${SEEDED_MERCHANTS.length} merchants. Admin: ${SEEDED_ADMIN.email} / ${SEEDED_ADMIN.password}. Merchant password: ${SEEDED_MERCHANT_PASSWORD}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});

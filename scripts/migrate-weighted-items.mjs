import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

let sitelistSites = [];
try {
  const sitelistPath = path.resolve('src/data/sitelist.json');
  if (fs.existsSync(sitelistPath)) {
    const parsed = JSON.parse(fs.readFileSync(sitelistPath, 'utf8'));
    sitelistSites = parsed.sites || [];
  }
} catch (e) {
  console.warn('Could not read sitelist.json:', e.message);
}

async function main() {
  console.log('--- Starting Weighted Items & Sitelist Metadata Migration ---');

  await prisma.project.updateMany({
    where: {
      OR: [
        { name: { contains: 'ALL CL KEDUNGTUBAN' } },
        { name: 'ROLLOUT GCI-MTI BLORA' },
      ],
    },
    data: {
      name: 'GCI-MTI BLORA',
    },
  });
  
  const clusters = await prisma.cluster.findMany({
    include: {
      workItems: true,
    },
  });

  console.log(`Found ${clusters.length} clusters.`);

  for (const cluster of clusters) {
    console.log(`Processing cluster: ${cluster.name}...`);

    // 0. Enrich cluster with sitelist metadata (Kecamatan, Kabupaten, EMR Site Code, etc.)
    const lowerName = cluster.name.trim().toLowerCase();
    const strippedName = lowerName.replace(/^kel(urahan)?\.?\s+/i, '').replace(/\s+blora$/i, '').trim();
    const matchedSite = sitelistSites.find(
      (s) =>
        s.shortName.toLowerCase() === lowerName ||
        s.shortName.toLowerCase() === strippedName ||
        s.clusterName.toLowerCase() === lowerName ||
        s.clusterId.toLowerCase() === lowerName
    );
    if (matchedSite) {
      await prisma.cluster.update({
        where: { id: cluster.id },
        data: {
          code: cluster.code || matchedSite.clusterId,
          emrSiteCode: cluster.emrSiteCode || matchedSite.emrSiteCode,
          subfeederId: cluster.subfeederId || matchedSite.subfeederId,
          clusterName: cluster.clusterName || matchedSite.clusterName,
          oltName: cluster.oltName || matchedSite.oltName,
          kecamatan: cluster.kecamatan || matchedSite.kecamatan || 'Kedungtuban',
          kabupaten: cluster.kabupaten || matchedSite.kabupaten || 'Blora',
        },
      });
    } else if (!cluster.kecamatan || !cluster.kabupaten) {
      await prisma.cluster.update({
        where: { id: cluster.id },
        data: {
          kecamatan: cluster.kecamatan || 'Kedungtuban',
          kabupaten: cluster.kabupaten || 'Blora',
        },
      });
    }

    // 1. Update existing items
    for (const item of cluster.workItems) {
      const name = item.itemName.toLowerCase();
      const cat = (item.category || '').toUpperCase();
      let scope = item.scope || 'CLUSTER';
      if (name.includes('feeder') || name.includes('sf-')) {
        scope = 'SUBFEEDER';
      }

      let workType = 'CW';
      let subCategory = 'POLE';
      let weight = 40;
      let unit = item.unit;

      if (cat === 'POLE' || name.includes('pole') || name.includes('tiang')) {
        workType = 'CW';
        subCategory = 'POLE';
        weight = scope === 'SUBFEEDER' ? 50 : 40;
        unit = 'Btg';
      } else if (cat === 'CABLE' || name.includes('kabel') || name.includes('cable')) {
        workType = 'CW';
        subCategory = 'CABLE';
        weight = 20;
        unit = 'Meter';
      } else if (cat === 'FAT' || name.includes('fat')) {
        workType = 'EL';
        subCategory = 'FAT';
        weight = 25;
        if (!unit || unit.trim().toLowerCase() === 'unit') unit = 'Pcs';
      } else if (cat === 'FDT' || name.includes('fdt')) {
        workType = 'EL';
        subCategory = 'FDT';
        weight = 5;
        if (!unit || unit.trim().toLowerCase() === 'unit') unit = 'Pcs';
      } else if (cat === 'JC' || name.includes('joint closure') || name.includes('jc')) {
        workType = 'EL';
        subCategory = 'JC';
        weight = 20;
        if (!unit || unit.trim().toLowerCase() === 'unit') unit = 'Pcs';
      } else if (
        cat === 'ACCESSORY' ||
        cat === 'SELING' ||
        name.includes('seling') ||
        name.includes('sling') ||
        name.includes('strand wire') ||
        name.includes('acc') ||
        name.includes('perapihan') ||
        name.includes('clamp')
      ) {
        workType = 'CW';
        subCategory = 'ACC';
        weight = 10;
        if (!unit || unit.trim().toLowerCase() === 'unit') unit = 'Pcs';
      } else if (unit && unit.trim().toLowerCase() === 'unit') {
        unit = 'Pcs';
      }

      await prisma.workItem.update({
        where: { id: item.id },
        data: {
          scope,
          workType,
          subCategory,
          weight,
          unit,
        },
      });
    }

    // 2. Ensure new BOQ item "Seling" (from BOQ-list.xlsx) exists on cluster
    const hasSeling = cluster.workItems.some(
      (wi) => wi.scope === 'CLUSTER' && wi.itemName.trim().toLowerCase() === 'seling'
    );
    if (!hasSeling) {
      await prisma.workItem.upsert({
        where: {
          clusterId_scope_itemName: {
            clusterId: cluster.id,
            scope: 'CLUSTER',
            itemName: 'Seling',
          },
        },
        update: {},
        create: {
          clusterId: cluster.id,
          scope: 'CLUSTER',
          workType: 'CW',
          category: 'SELING',
          subCategory: 'ACC',
          weight: 10,
          itemName: 'Seling',
          unit: 'Meter',
          boq: 0,
          status: 'ONGOING',
          sortOrder: 12,
        },
      });
    }
  }

  console.log('--- Migration completed successfully ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


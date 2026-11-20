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

const SUBFEEDER_ONLY_CABLES = new Set(['kabel 96c', 'kabel 144c', 'kabel 288c']);

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
      workItems: {
        include: {
          progressList: { select: { id: true } },
        },
      },
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

    // 1. Update existing items (and enforce Kabel 96c/144c/288c belong ONLY in SUBFEEDER)
    for (const item of cluster.workItems) {
      const name = item.itemName.toLowerCase();
      const trimmedLower = name.trim();
      const cat = (item.category || '').toUpperCase();
      let scope = item.scope || 'CLUSTER';
      if (name.includes('feeder') || name.includes('sf-') || SUBFEEDER_ONLY_CABLES.has(trimmedLower)) {
        scope = 'SUBFEEDER';
      }

      if (item.scope === 'CLUSTER' && SUBFEEDER_ONLY_CABLES.has(trimmedLower)) {
        const hasSfSibling = cluster.workItems.some(
          (other) =>
            other.id !== item.id &&
            other.scope === 'SUBFEEDER' &&
            other.itemName.trim().toLowerCase() === trimmedLower
        );
        if (hasSfSibling || (item.boq === 0 && item.progressList.length === 0)) {
          if (item.progressList.length === 0) {
            await prisma.workItem.delete({ where: { id: item.id } });
            continue;
          }
        }
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

    // 2. Ensure new/revised BOQ items from BOQ-list.xlsx exist in their respective scope
    const ensuredScopedItems = [
      {
        scope: 'CLUSTER',
        workType: 'CW',
        category: 'POLE',
        subCategory: 'POLE',
        weight: 40,
        itemName: 'Pole 9m "4"',
        unit: 'Btg',
        sortOrder: 4,
      },
      {
        scope: 'CLUSTER',
        workType: 'CW',
        category: 'SELING',
        subCategory: 'ACC',
        weight: 10,
        itemName: 'Seling',
        unit: 'Meter',
        sortOrder: 11,
      },
      {
        scope: 'SUBFEEDER',
        workType: 'CW',
        category: 'CABLE',
        subCategory: 'CABLE',
        weight: 20,
        itemName: 'Kabel 96c',
        unit: 'Meter',
        sortOrder: 102,
      },
      {
        scope: 'SUBFEEDER',
        workType: 'CW',
        category: 'CABLE',
        subCategory: 'CABLE',
        weight: 20,
        itemName: 'Kabel 144c',
        unit: 'Meter',
        sortOrder: 103,
      },
      {
        scope: 'SUBFEEDER',
        workType: 'CW',
        category: 'CABLE',
        subCategory: 'CABLE',
        weight: 20,
        itemName: 'Kabel 288c',
        unit: 'Meter',
        sortOrder: 104,
      },
    ];

    for (const reqItem of ensuredScopedItems) {
      await prisma.workItem.upsert({
        where: {
          clusterId_scope_itemName: {
            clusterId: cluster.id,
            scope: reqItem.scope,
            itemName: reqItem.itemName,
          },
        },
        update: {},
        create: {
          clusterId: cluster.id,
          scope: reqItem.scope,
          workType: reqItem.workType,
          category: reqItem.category,
          subCategory: reqItem.subCategory,
          weight: reqItem.weight,
          itemName: reqItem.itemName,
          unit: reqItem.unit,
          boq: 0,
          status: 'ONGOING',
          sortOrder: reqItem.sortOrder,
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


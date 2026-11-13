import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Weighted Items Migration ---');
  
  const clusters = await prisma.cluster.findMany({
    include: {
      workItems: true,
    },
  });

  console.log(`Found ${clusters.length} clusters.`);

  for (const cluster of clusters) {
    console.log(`Processing cluster: ${cluster.name}...`);

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

      if (cat === 'POLE' || name.includes('pole') || name.includes('tiang')) {
        workType = 'CW';
        subCategory = 'POLE';
        weight = scope === 'SUBFEEDER' ? 50 : 40;
      } else if (cat === 'CABLE' || name.includes('kabel') || name.includes('cable')) {
        workType = 'CW';
        subCategory = 'CABLE';
        weight = 20;
      } else if (cat === 'FAT' || name.includes('fat')) {
        workType = 'EL';
        subCategory = 'FAT';
        weight = 25;
      } else if (cat === 'FDT' || name.includes('fdt')) {
        workType = 'EL';
        subCategory = 'FDT';
        weight = 5;
      } else if (cat === 'JC' || name.includes('joint closure') || name.includes('jc')) {
        workType = 'EL';
        subCategory = 'JC';
        weight = 20;
      } else if (cat === 'ACCESSORY' || name.includes('acc') || name.includes('perapihan') || name.includes('clamp')) {
        workType = 'CW';
        subCategory = 'ACC';
        weight = 10;
      }

      await prisma.workItem.update({
        where: { id: item.id },
        data: {
          scope,
          workType,
          subCategory,
          weight,
        },
      });
    }

    // 2. Ensure CLR has Aksesoris & Perapihan
    const hasClrAcc = cluster.workItems.some(
      (w) => w.scope === 'CLUSTER' && (w.subCategory === 'ACC' || w.itemName.toLowerCase().includes('perapihan'))
    );
    if (!hasClrAcc) {
      await prisma.workItem.create({
        data: {
          clusterId: cluster.id,
          scope: 'CLUSTER',
          workType: 'CW',
          category: 'ACCESSORY',
          subCategory: 'ACC',
          weight: 10,
          itemName: 'Aksesoris & Perapihan Cluster',
          unit: 'Meter',
          boq: 0,
          status: 'ONGOING',
          sortOrder: 40,
        },
      });
    }

    // 3. Ensure SF standard items exist
    const standardSfItems = [
      {
        itemName: 'Tiang Feeder (Pole SF)',
        category: 'POLE',
        subCategory: 'POLE',
        workType: 'CW',
        weight: 50,
        unit: 'Btg',
        sortOrder: 100,
      },
      {
        itemName: 'Kabel Feeder (Cable SF)',
        category: 'CABLE',
        subCategory: 'CABLE',
        workType: 'CW',
        weight: 20,
        unit: 'Meter',
        sortOrder: 101,
      },
      {
        itemName: 'Aksesoris & Perapihan Subfeeder',
        category: 'ACCESSORY',
        subCategory: 'ACC',
        workType: 'CW',
        weight: 10,
        unit: 'Meter',
        sortOrder: 102,
      },
      {
        itemName: 'Joint Closure (JC)',
        category: 'JC',
        subCategory: 'JC',
        workType: 'EL',
        weight: 20,
        unit: 'Unit',
        sortOrder: 103,
      },
    ];

    for (const sfItem of standardSfItems) {
      const exists = await prisma.workItem.findFirst({
        where: {
          clusterId: cluster.id,
          scope: 'SUBFEEDER',
          itemName: sfItem.itemName,
        },
      });
      if (!exists) {
        await prisma.workItem.create({
          data: {
            clusterId: cluster.id,
            scope: 'SUBFEEDER',
            workType: sfItem.workType,
            category: sfItem.category,
            subCategory: sfItem.subCategory,
            weight: sfItem.weight,
            itemName: sfItem.itemName,
            unit: sfItem.unit,
            boq: 0,
            status: 'ONGOING',
            sortOrder: sfItem.sortOrder,
          },
        });
      }
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


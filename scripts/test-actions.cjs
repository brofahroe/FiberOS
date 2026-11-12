const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDatabase() {
  console.log('--- Testing FiberOS Database & Analytics ---');
  
  const project = await prisma.project.findFirst({
    include: {
      clusters: {
        include: {
          workItems: {
            include: {
              progressList: true,
            },
          },
        },
      },
    },
  });

  console.log(`Project: ${project.name}`);
  console.log(`Total Clusters: ${project.clusters.length}`);

  let totalBoq = 0;
  let totalInstalled = 0;

  for (const c of project.clusters) {
    let cBoq = 0;
    let cInst = 0;
    for (const w of c.workItems) {
      cBoq += w.boq;
      const inst = w.progressList.reduce((s, p) => s + p.quantity, 0);
      cInst += inst;
    }
    totalBoq += cBoq;
    totalInstalled += cInst;
    const pct = cBoq > 0 ? Math.round((cInst / cBoq) * 100) : 0;
    console.log(` - Cluster: ${c.name.padEnd(20)} | HP: ${String(c.homePasses).padStart(4)} | Items: ${c.workItems.length} | Progress: ${String(pct).padStart(3)}% (${cInst}/${cBoq})`);
  }

  const overallPct = totalBoq > 0 ? Math.round((totalInstalled / totalBoq) * 100) : 0;
  console.log(`\nOverall Project Progress: ${overallPct}% (${totalInstalled} / ${totalBoq})`);
}

testDatabase()
  .catch(console.error)
  .finally(() => prisma.$disconnect());


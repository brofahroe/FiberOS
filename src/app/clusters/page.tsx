import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Layers, PlusCircle, FileSpreadsheet, Building2 } from 'lucide-react';

export const revalidate = 0;

export default async function ClustersPage() {
  const clusters = await prisma.cluster.findMany({
    include: {
      workItems: {
        include: {
          progressList: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-blue-600" />
            Master Cluster & BOQ
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar cluster, kapasitas home pass, dan target BOQ tiap item pekerjaan.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/import-boq"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            + Impor BOQ Baru
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        {clusters.map((cluster) => {
          let totalBoq = 0;
          let totalInstalled = 0;

          const items = cluster.workItems.map((it) => {
            const installed = it.progressList.reduce((sum, p) => sum + p.quantity, 0);
            totalBoq += it.boq;
            totalInstalled += installed;
            return {
              ...it,
              installed,
              remaining: Math.max(0, it.boq - installed),
              percentage: it.boq > 0 ? Math.min(100, Math.round((installed / it.boq) * 100)) : 0,
            };
          });

          const clusterPct = totalBoq > 0 ? Math.min(100, Math.round((totalInstalled / totalBoq) * 100)) : 0;

          return (
            <div key={cluster.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{cluster.name}</h2>
                    <p className="text-xs text-slate-500">
                      Home Passes: <strong className="text-slate-700">{cluster.homePasses || '-'}</strong> • Progress: <strong className="text-blue-600">{clusterPct}%</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/daily-input?clusterId=${cluster.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold rounded-lg text-xs transition"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Input Harian
                  </Link>
                  <Link
                    href={`/matrix?clusterId=${cluster.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold rounded-lg text-xs transition"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Matriks
                  </Link>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Item Pekerjaan</th>
                      <th className="p-3 w-28">Kategori</th>
                      <th className="p-3 w-20 text-center">Satuan</th>
                      <th className="p-3 w-28 text-right">Target BOQ</th>
                      <th className="p-3 w-28 text-right">Terpasang</th>
                      <th className="p-3 w-28 text-right">Sisa</th>
                      <th className="p-3 w-24 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {items.map((it) => (
                      <tr key={it.id} className="hover:bg-slate-50 transition">
                        <td className="p-3 font-semibold text-slate-900">{it.itemName}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                            {it.category}
                          </span>
                        </td>
                        <td className="p-3 text-center text-slate-500">{it.unit}</td>
                        <td className="p-3 text-right font-bold text-slate-800">{it.boq.toLocaleString()}</td>
                        <td className="p-3 text-right font-bold text-blue-600">{it.installed.toLocaleString()}</td>
                        <td className="p-3 text-right text-slate-600">{it.remaining.toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              it.percentage >= 100
                                ? 'bg-emerald-100 text-emerald-700'
                                : it.percentage > 0
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {it.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


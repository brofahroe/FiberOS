'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runInitialSeed } from '@/actions/seed';
import { Sparkles, Loader2, CheckCircle2 } from 'lucide-react';

export default function SeedButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSeed = async () => {
    setLoading(true);
    const res = await runInitialSeed();
    setLoading(false);
    if (res.success) {
      setSuccess(true);
      setTimeout(() => {
        router.refresh();
      }, 500);
    } else {
      alert(res.error || 'Gagal memuat data awal');
    }
  };

  return (
    <button
      onClick={handleSeed}
      disabled={loading || success}
      className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 transition transform active:scale-95 disabled:opacity-50"
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Memuat 15 Cluster...</span>
        </>
      ) : success ? (
        <>
          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
          <span>Selesai! Menyegarkan...</span>
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>Muat Data Proyek Blora (15 Cluster)</span>
        </>
      )}
    </button>
  );
}


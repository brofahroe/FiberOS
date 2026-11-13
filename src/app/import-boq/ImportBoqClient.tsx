'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseBoqExcel, parseSampleBoqFile, commitBoqImport, ParsedBoqResult } from '@/actions/importBoq';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Layers, 
  Check, 
  FileText,
  Save,
  ArrowRight
} from 'lucide-react';

export default function ImportBoqClient() {
  const router = useRouter();
  const [parsing, setParsing] = useState<boolean>(false);
  const [committing, setCommitting] = useState<boolean>(false);
  const [result, setResult] = useState<ParsedBoqResult | null>(null);
  const [clusterName, setClusterName] = useState<string>('');
  const [scope, setScope] = useState<'CLUSTER' | 'SUBFEEDER'>('CLUSTER');
  const [homePasses, setHomePasses] = useState<string>('0');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setMessage(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      const res = await parseBoqExcel(base64, file.name);
      setParsing(false);

      if (res.success && res.data) {
        setResult(res.data);
        setClusterName(res.data.clusterName);
        setScope(res.data.scope || 'CLUSTER');
      } else {
        setMessage({ type: 'error', text: res.error || 'Gagal membaca file Excel' });
      }
    };
    reader.onerror = () => {
      setParsing(false);
      setMessage({ type: 'error', text: 'Gagal mengunggah file' });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleLoadSample = async (filename: string) => {
    setParsing(true);
    setMessage(null);
    setResult(null);

    const res = await parseSampleBoqFile(filename);
    setParsing(false);

    if (res.success && res.data) {
      setResult(res.data);
      setClusterName(res.data.clusterName);
      setScope(res.data.scope || 'CLUSTER');
      setMessage({ type: 'success', text: `File contoh "${filename}" berhasil dibaca!` });
    } else {
      setMessage({ type: 'error', text: res.error || 'Gagal membaca file contoh' });
    }
  };

  const handleCommit = async () => {
    if (!result || !clusterName.trim()) {
      setMessage({ type: 'error', text: 'Nama cluster harus diisi.' });
      return;
    }

    setCommitting(true);
    setMessage(null);

    const res = await commitBoqImport({
      clusterName: clusterName.trim(),
      scope,
      homePasses: parseInt(homePasses) || 0,
      items: result.items,
    });

    setCommitting(false);

    if (res.success) {
      setMessage({ type: 'success', text: res.message || 'Berhasil mengimpor BOQ' });
      setTimeout(() => {
        router.push('/');
        router.refresh();
      }, 1500);
    } else {
      setMessage({ type: 'error', text: res.error || 'Gagal menyimpan BOQ' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Upload className="w-6 h-6 text-blue-600" />
            Impor Master BOQ dari File Excel
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Unggah file format APD (Cluster / Subfeeder) untuk mendaftarkan target volume pekerjaan secara otomatis.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Upload Box */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/40 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition text-center group">
          <div className="p-4 bg-blue-100/70 text-blue-600 rounded-full group-hover:scale-110 transition">
            <FileSpreadsheet className="w-8 h-8" />
          </div>
          <span className="font-bold text-slate-800 text-base mt-3">
            Pilih File Excel BOQ (.xlsx / .xls)
          </span>
          <span className="text-xs text-slate-500 mt-1 max-w-sm">
            Mendukung format resmi APD: Sheet BoQ NRO Cluster atau BoQ NRO All Feeder.
          </span>
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={handleFileUpload}
            className="hidden"
            disabled={parsing}
          />
        </label>

        {parsing && (
          <div className="flex items-center justify-center gap-2 py-4 text-blue-600 font-semibold text-sm">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Menganalisis lembar kerja BOQ...</span>
          </div>
        )}

        {/* Quick Load Buttons from existing project files */}
        <div className="pt-2 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
            Atau muat contoh file yang sudah tersedia di proyek:
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleLoadSample('BLA000190 KELURAHAN NGRAHO BLORA_BOQ_APD(CLUSTER).xlsx')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 transition"
            >
              <FileText className="w-3.5 h-3.5" />
              Contoh BOQ APD Cluster (NGRAHO)
            </button>
            <button
              type="button"
              onClick={() => handleLoadSample('BLA000190 SF-KELURAHAN NGRAHO BLORA_BOQ_APD(SUBFEEDER).xlsx')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg text-xs font-medium border border-slate-200 transition"
            >
              <FileText className="w-3.5 h-3.5" />
              Contoh BOQ APD Subfeeder (NGRAHO)
            </button>
          </div>
        </div>
      </div>

      {/* Preview Section */}
      {result && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full mb-1">
                <Check className="w-3 h-3" /> Berhasil Membaca Lembar Kerja: {result.sheetName}
              </span>
              <h2 className="text-lg font-bold text-slate-900">
                Preview Data BOQ Terdeteksi ({result.totalItems} item)
              </h2>
            </div>

            <button
              onClick={handleCommit}
              disabled={committing}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 transition disabled:opacity-50"
            >
              {committing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan ke Database...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Simpan ke Database</span>
                </>
              )}
            </button>
          </div>

          {/* Cluster details inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Cluster Target
              </label>
              <input
                type="text"
                value={clusterName}
                onChange={(e) => setClusterName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Scope Pekerjaan
              </label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="CLUSTER">🏙️ Pekerjaan Cluster (Bobot 70%)</option>
                <option value="SUBFEEDER">📡 Pekerjaan Subfeeder (Bobot 30%)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kapasitas Home Passes (HP)
              </label>
              <input
                type="number"
                value={homePasses}
                onChange={(e) => setHomePasses(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Table Preview */}
          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 z-10">
                <tr>
                  <th className="p-3 border-b border-slate-200 w-12 text-center">No</th>
                  <th className="p-3 border-b border-slate-200">Item Pekerjaan</th>
                  <th className="p-3 border-b border-slate-200 w-28">Kategori</th>
                  <th className="p-3 border-b border-slate-200 w-20 text-center">Satuan</th>
                  <th className="p-3 border-b border-slate-200 w-28 text-right">Volume BOQ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {result.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="p-2.5 text-center text-slate-400">{idx + 1}</td>
                    <td className="p-2.5 font-medium text-slate-900">{item.itemName}</td>
                    <td className="p-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {item.category}
                      </span>
                    </td>
                    <td className="p-2.5 text-center text-slate-500">{item.unit}</td>
                    <td className="p-2.5 text-right font-bold text-blue-700">
                      {item.quantity.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

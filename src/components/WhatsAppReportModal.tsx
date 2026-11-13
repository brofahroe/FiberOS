'use client';

import { useState, useEffect } from 'react';
import { getWhatsAppReportData, WaReportData } from '@/actions/whatsappReport';
import { 
  MessageSquare, 
  Copy, 
  Check, 
  ExternalLink, 
  X, 
  Loader2, 
  Settings2, 
  ChevronDown, 
  ChevronUp,
  Share2
} from 'lucide-react';

interface WhatsAppReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  clusterId: string;
  reportDate: string;
  clusterName?: string;
}

export default function WhatsAppReportModal({
  isOpen,
  onClose,
  clusterId,
  reportDate,
  clusterName: initialClusterName,
}: WhatsAppReportModalProps) {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<WaReportData | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Customizable Metadata (saved in localStorage)
  const [siteName, setSiteName] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('CLRMO7-99-077');
  const [city, setCity] = useState<string>('BLORA');
  const [olt, setOlt] = useState<string>('Balun');
  const [ztePic, setZtePic] = useState<string>('HENDRI');
  const [subconName, setSubconName] = useState<string>('GCI');
  const [teamQty, setTeamQty] = useState<string>('7 Orang');
  const [subconLeader, setSubconLeader] = useState<string>('RICKY');
  const [startImDate, setStartImDate] = useState<string>('01/11/26');
  const [planAtpCw, setPlanAtpCw] = useState<string>('DD/MM/YY');
  const [planAtpOpm, setPlanAtpOpm] = useState<string>('0/0/2026');

  // Load saved preferences
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedCity = localStorage.getItem('wa_city');
      const savedOlt = localStorage.getItem('wa_olt');
      const savedZtePic = localStorage.getItem('wa_ztePic');
      const savedSubcon = localStorage.getItem('wa_subcon');
      const savedTeamQty = localStorage.getItem('wa_teamQty');
      const savedLeader = localStorage.getItem('wa_leader');
      const savedStartIm = localStorage.getItem('wa_startIm');
      const savedPlanCw = localStorage.getItem('wa_planCw');
      const savedPlanOpm = localStorage.getItem('wa_planOpm');

      if (savedCity) setCity(savedCity);
      if (savedOlt) setOlt(savedOlt);
      if (savedZtePic) setZtePic(savedZtePic);
      if (savedSubcon) setSubconName(savedSubcon);
      if (savedTeamQty) setTeamQty(savedTeamQty);
      if (savedLeader) setSubconLeader(savedLeader);
      if (savedStartIm) setStartImDate(savedStartIm);
      if (savedPlanCw) setPlanAtpCw(savedPlanCw);
      if (savedPlanOpm) setPlanAtpOpm(savedPlanOpm);
    }
  }, []);

  const saveSettings = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('wa_city', city);
      localStorage.setItem('wa_olt', olt);
      localStorage.setItem('wa_ztePic', ztePic);
      localStorage.setItem('wa_subcon', subconName);
      localStorage.setItem('wa_teamQty', teamQty);
      localStorage.setItem('wa_leader', subconLeader);
      localStorage.setItem('wa_startIm', startImDate);
      localStorage.setItem('wa_planCw', planAtpCw);
      localStorage.setItem('wa_planOpm', planAtpOpm);
    }
  };

  useEffect(() => {
    if (!isOpen || !clusterId || !reportDate) return;

    setLoading(true);
    setCopied(false);

    getWhatsAppReportData(clusterId, reportDate).then((res) => {
      setLoading(false);
      if (res.success && res.data) {
        setData(res.data);
        const autoSiteName = `KELURAHAN ${res.data.clusterName.toUpperCase()} BLORA`;
        setSiteName(autoSiteName);
        if (res.data.siteId) setSiteId(res.data.siteId);
        if (res.data.reporterName) setSubconLeader(res.data.reporterName);
        if (res.data.teamName) setSubconName(res.data.teamName);
      }
    });
  }, [isOpen, clusterId, reportDate]);

  if (!isOpen) return null;

  const formatNumber = (num: number) => num.toLocaleString('id-ID');

  const buildWaText = () => {
    if (!data) return '';

    const formatMetric = (item: { boq: number; actual: number; today: number; isDone: boolean }) => {
      const boqStr = formatNumber(item.boq);
      const actStr = formatNumber(item.actual);
      
      let todayStr = formatNumber(item.today);
      if (item.today > 0 && (item.isDone || item.actual >= item.boq)) {
        todayStr = `${todayStr}✅`;
      } else if (item.today === 0 && (item.isDone || (item.boq > 0 && item.actual >= item.boq))) {
        todayStr = '✅';
      }

      return `${boqStr}/${actStr}/${todayStr}`;
    };

    const d = data.distribusi;
    const s = data.subfeeder;

    const clrPoleLine = formatMetric(d.pole);
    const clrCableLine = formatMetric(d.cable);
    const clrFdtLine = formatMetric(d.fdt);
    const clrFatLine = formatMetric(d.fat);
    const clrWireLine = formatMetric(d.wireSling);

    const sfPoleLine = formatMetric(s.pole);
    const sfCableLine = formatMetric(s.cable);
    const sfJcLine = formatMetric(s.jc);

    return `*ZTE BLORA FTTH Project MoraRepublic*
*${data.formattedDate}*
Site Name: *${siteName}*
Site ID:  *${siteId}*
City: ${city}
OLT: ${olt}
ZTE PIC :  ${ztePic}
Subcon name : ${subconName}
Subcon teams Qty : ${teamQty}
Subcon leader : ${subconLeader}
Tanggal Start IM: ${startImDate}
 
Format : ( SOW BOQ / TOTAL ACTUAL / PENCAPAIAN HARI INI ) : X/Y/Z
 
DISTRIBUSI
 
Install Pole : ${clrPoleLine}
Pooling Cable : ${clrCableLine}
FDT : ${clrFdtLine}
FAT : ${clrFatLine}
Instalasi Wire/Sling 6mm :  ${clrWireLine}
 
SUBFEEDER
 
Install Pole : ${sfPoleLine}
Pooling Cable : ${sfCableLine}
JC : ${sfJcLine}
 
PLAN ATP CIVIL WORK :
${planAtpCw}
PLAN ATP OPM TEST : ${planAtpOpm}
 
Progress Today :
 
Install pole CLR: ${d.pole.today > 0 ? `${formatNumber(d.pole.today)} pole` : '- pole'}
Install pole SF: ${s.pole.today > 0 ? `${formatNumber(s.pole.today)} pole` : '- pole'}
Puling Cable CLR :  ${d.cable.today > 0 ? `${formatNumber(d.cable.today)} m` : ' m'}
Pulling Cable SF: ${s.cable.today > 0 ? `${formatNumber(s.cable.today)} m` : '-'}
Install Slingware :  ${d.wireSling.today > 0 ? `${formatNumber(d.wireSling.today)} m` : '- m'}
Install FDT : ${d.fdt.today > 0 ? formatNumber(d.fdt.today) : ''}
Install FAT : ${d.fat.today}
Install JC : ${s.jc.today}`;
  };

  const waMessage = buildWaText();

  const handleCopy = async () => {
    saveSettings();
    try {
      await navigator.clipboard.writeText(waMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Gagal menyalin teks secara otomatis. Silakan salin manual dari kotak teks.');
    }
  };

  const handleOpenWhatsApp = () => {
    saveSettings();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(waMessage)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-2xl shadow-md shadow-emerald-500/20">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-1.5">
                Format Laporan WhatsApp Resmi
              </h2>
              <p className="text-xs text-slate-500">
                Format broadcast ZTE MoraRepublic per hari untuk Waspang & Supervisor
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {loading ? (
            <div className="py-16 text-center text-slate-500 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-600" />
              <p className="text-sm font-semibold">Mengompilasi data format WhatsApp...</p>
            </div>
          ) : (
            <>
              {/* Customizable Metadata Accordion */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50">
                <button
                  type="button"
                  onClick={() => setShowSettings(!showSettings)}
                  className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  <span className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-emerald-600" />
                    Pengaturan Identitas Header & PIC (ZTE, Subcon, OLT)
                  </span>
                  {showSettings ? (
                    <ChevronUp className="w-4 h-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500" />
                  )}
                </button>

                {showSettings && (
                  <div className="p-4 border-t border-slate-200 bg-white grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">Site Name</label>
                      <input
                        type="text"
                        value={siteName}
                        onChange={(e) => setSiteName(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">Site ID</label>
                      <input
                        type="text"
                        value={siteId}
                        onChange={(e) => setSiteId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">ZTE PIC</label>
                      <input
                        type="text"
                        value={ztePic}
                        onChange={(e) => setZtePic(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">OLT</label>
                      <input
                        type="text"
                        value={olt}
                        onChange={(e) => setOlt(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">Subcon Name</label>
                      <input
                        type="text"
                        value={subconName}
                        onChange={(e) => setSubconName(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">Subcon Leader</label>
                      <input
                        type="text"
                        value={subconLeader}
                        onChange={(e) => setSubconLeader(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">Teams Qty</label>
                      <input
                        type="text"
                        value={teamQty}
                        onChange={(e) => setTeamQty(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">Start IM Date</label>
                      <input
                        type="text"
                        value={startImDate}
                        onChange={(e) => setStartImDate(e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-medium"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Message Preview Box */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700">Preview Pesan:</span>
                  <span className="text-[11px] text-slate-400">Siap kirim ke Group WhatsApp</span>
                </div>
                <div className="relative">
                  <textarea
                    readOnly
                    value={waMessage}
                    rows={15}
                    className="w-full p-4 bg-slate-900 text-emerald-300 font-mono text-xs rounded-2xl focus:outline-none shadow-inner leading-relaxed resize-none selection:bg-emerald-600 selection:text-white"
                  />
                  {copied && (
                    <div className="absolute top-3 right-3 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg animate-in fade-in duration-200">
                      <Check className="w-3.5 h-3.5" />
                      <span>Berhasil Disalin!</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition"
          >
            Tutup
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || !data}
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Tersalin!' : 'Salin Format WA'}</span>
            </button>

            <button
              type="button"
              disabled={loading || !data}
              onClick={handleOpenWhatsApp}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/25 transition disabled:opacity-50"
            >
              <Share2 className="w-4 h-4" />
              <span>Buka di WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


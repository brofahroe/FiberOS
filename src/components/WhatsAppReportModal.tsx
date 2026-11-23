'use client';

import { useState, useEffect, useRef } from 'react';
import { getMultiClusterWhatsAppReportData, WaReportData } from '@/actions/whatsappReport';
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
  Building2,
  Calendar,
  RotateCcw,
  Search,
  CheckSquare,
  Square,
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
}: WhatsAppReportModalProps) {
  const [selectedClusterIds, setSelectedClusterIds] = useState<string[]>(() =>
    clusterId ? [clusterId] : []
  );
  const [selectedReportDate, setSelectedReportDate] = useState<string>(reportDate);
  const [clustersList, setClustersList] = useState<Array<{ id: string; name: string; code?: string | null }>>([]);
  const [datesList, setDatesList] = useState<string[]>([]);
  const [clustersWithReports, setClustersWithReports] = useState<string[]>([]);

  const [clusterDropdownOpen, setClusterDropdownOpen] = useState<boolean>(false);
  const [clusterSearch, setClusterSearch] = useState<string>('');
  const clusterDropdownRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [reportsData, setReportsData] = useState<WaReportData[]>([]);
  const [copied, setCopied] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [customMessage, setCustomMessage] = useState<string | null>(null);

  // Customizable Metadata (saved in localStorage)
  const [siteName, setSiteName] = useState<string>('');
  const [siteId, setSiteId] = useState<string>('CLRMO7-99-077');
  const [city, setCity] = useState<string>('BLORA');
  const [olt, setOlt] = useState<string>('Balun');
  const [ztePic, setZtePic] = useState<string>('HENDRI');
  const FIXED_SUBCON_NAME = 'PT. GCI Indonesia';
  const [teamQty, setTeamQty] = useState<string>('7 Orang');
  const [subconLeader, setSubconLeader] = useState<string>('RICKY');
  const [startImDate, setStartImDate] = useState<string>('01/11/26');
  const [planAtpCw, setPlanAtpCw] = useState<string>('DD/MM/YY');
  const [planAtpOpm, setPlanAtpOpm] = useState<string>('0/0/2026');

  // Sync initial props whenever modal is closed or props change
  useEffect(() => {
    if (!isOpen) {
      setClusterDropdownOpen(false);
      setClusterSearch('');
      setSelectedClusterIds(clusterId ? [clusterId] : []);
      if (reportDate) setSelectedReportDate(reportDate);
    } else {
      if (clusterId) {
        setSelectedClusterIds((prev) => (prev.length === 0 ? [clusterId] : prev));
      }
      if (reportDate) {
        setSelectedReportDate((prev) => prev || reportDate);
      }
    }
  }, [isOpen, clusterId, reportDate]);

  // Close multi-select dropdown when clicking outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (clusterDropdownRef.current && !clusterDropdownRef.current.contains(e.target as Node)) {
        setClusterDropdownOpen(false);
      }
    };
    if (clusterDropdownOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [clusterDropdownOpen]);

  // Load saved preferences
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedCity = localStorage.getItem('wa_city');
      const savedOlt = localStorage.getItem('wa_olt');
      const savedZtePic = localStorage.getItem('wa_ztePic');
      const savedTeamQty = localStorage.getItem('wa_teamQty');
      const savedLeader = localStorage.getItem('wa_leader');
      const savedStartIm = localStorage.getItem('wa_startIm');
      const savedPlanCw = localStorage.getItem('wa_planCw');
      const savedPlanOpm = localStorage.getItem('wa_planOpm');

      if (savedCity) setCity(savedCity);
      if (savedOlt) setOlt(savedOlt);
      if (savedZtePic) setZtePic(savedZtePic);
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
      localStorage.setItem('wa_teamQty', teamQty);
      localStorage.setItem('wa_leader', subconLeader);
      localStorage.setItem('wa_startIm', startImDate);
      localStorage.setItem('wa_planCw', planAtpCw);
      localStorage.setItem('wa_planOpm', planAtpOpm);
    }
  };

  const loadReportData = async (cIds: string[], rDate: string) => {
    setLoading(true);
    setCopied(false);

    const res = await getMultiClusterWhatsAppReportData(cIds, rDate);
    setLoading(false);

    if (res.success && res.reports) {
      setReportsData(res.reports);
      if (res.availableClusters && res.availableClusters.length > 0) {
        setClustersList(res.availableClusters);
        if (cIds.length === 0 && res.reports.length > 0) {
          setSelectedClusterIds([res.reports[0].clusterId]);
        }
      }
      if (res.availableDates && res.availableDates.length > 0) {
        setDatesList(res.availableDates);
      }
      if (res.clustersWithReportsOnDate) {
        setClustersWithReports(res.clustersWithReportsOnDate);
      }

      // Automatically update siteName, siteId, and OLT when 1 cluster is selected
      if (res.reports.length === 1) {
        const primary = res.reports[0];
        const autoSiteName =
          primary.officialSiteName || `KELURAHAN ${primary.clusterName.toUpperCase()} BLORA`;
        setSiteName(autoSiteName);
        if (primary.siteId) setSiteId(primary.siteId);
        if (primary.oltName) setOlt(primary.oltName);
        if (primary.reporterName) setSubconLeader(primary.reporterName);
      }
      setCustomMessage(null); // Reset manual edit to show fresh report
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const idsToLoad = selectedClusterIds.length > 0 ? selectedClusterIds : (clusterId ? [clusterId] : []);
    loadReportData(idsToLoad, selectedReportDate);
  }, [isOpen, selectedClusterIds, selectedReportDate, clusterId]);

  const toggleClusterSelection = (cId: string) => {
    setSelectedClusterIds((prev) => {
      if (prev.includes(cId)) {
        // Keep at least 1 cluster selected
        if (prev.length <= 1) return prev;
        return prev.filter((id) => id !== cId);
      }
      return [...prev, cId];
    });
  };

  const handleSelectClustersWithReports = () => {
    if (clustersWithReports.length > 0) {
      setSelectedClusterIds(clustersWithReports);
    }
  };

  const handleDateSelect = (newDate: string) => {
    setSelectedReportDate(newDate);
  };

  if (!isOpen) return null;

  const formatNumber = (num: number) => num.toLocaleString('id-ID');

  const formatSingleClusterReport = (itemData: WaReportData, isSingleSelection: boolean) => {
    const formatMetric = (item: { boq: number; actual: number; today: number; isDone: boolean }) => {
      const boqStr = formatNumber(item.boq);
      const actStr = formatNumber(item.actual);

      let todayStr = '';
      if (item.isDone) {
        // Tanda centang ijo (✅) HANYA muncul jika kondisi sudah final = DONE
        if (item.today > 0) {
          todayStr = `${formatNumber(item.today)}✅`;
        } else {
          todayStr = '✅';
        }
      } else {
        // Kondisi belum final / masih ONGOING: Jangan ada centang ijo!
        if (item.today > 0) {
          todayStr = formatNumber(item.today);
        } else {
          todayStr = '0';
        }
      }

      return `${boqStr}/${actStr}/${todayStr}`;
    };

    const d = itemData.distribusi;
    const s = itemData.subfeeder;

    const clrPoleLine = formatMetric(d.pole);
    const clrCableLine = formatMetric(d.cable);
    const clrFdtLine = formatMetric(d.fdt);
    const clrFatLine = formatMetric(d.fat);
    const clrWireLine = formatMetric(d.wireSling);

    const sfPoleLine = formatMetric(s.pole);
    const sfCableLine = formatMetric(s.cable);
    const sfJcLine = formatMetric(s.jc);

    const effectiveSiteName = isSingleSelection
      ? siteName || itemData.officialSiteName
      : itemData.officialSiteName || `KELURAHAN ${itemData.clusterName.toUpperCase()} BLORA`;
    const effectiveSiteId = isSingleSelection ? siteId || itemData.siteId : itemData.siteId;
    const effectiveOlt = isSingleSelection ? olt || itemData.oltName : itemData.oltName || olt;
    const effectiveLeader = isSingleSelection
      ? subconLeader
      : itemData.reporterName || subconLeader;

    const headerBlock = `*ZTE BLORA FTTH Project MoraRepublic*
*${itemData.formattedDate}*
Site Name: *${effectiveSiteName}*
Site ID:  *${effectiveSiteId}*
City: ${city}
OLT: ${effectiveOlt}
ZTE PIC :  ${ztePic}
Subcon name : ${FIXED_SUBCON_NAME}
Subcon teams Qty : ${teamQty}
Subcon leader : ${effectiveLeader}
Tanggal Start IM: ${startImDate}
 
Format : ( SOW BOQ / TOTAL ACTUAL / PENCAPAIAN HARI INI ) : X/Y/Z`;

    if (itemData.isMainFeeder) {
      return `${headerBlock}
 
MAIN FEEDER (100% FEEDER)
 
Install Pole : ${sfPoleLine}
Pooling Cable : ${sfCableLine}
JC : ${sfJcLine}
 
PLAN ATP CIVIL WORK :
${planAtpCw}
PLAN ATP OPM TEST : ${planAtpOpm}
 
Progress Today :
 
Install pole MF: ${s.pole.today > 0 ? `${formatNumber(s.pole.today)} pole` : '- pole'}
Pulling Cable MF: ${s.cable.today > 0 ? `${formatNumber(s.cable.today)} m` : '-'}
Install JC : ${s.jc.today > 0 ? formatNumber(s.jc.today) : '0'}`;
    }

    return `${headerBlock}
 
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
Puling Cable CLR :  ${d.cable.today > 0 ? `${formatNumber(d.cable.today)} m` : '- m'}
Pulling Cable SF: ${s.cable.today > 0 ? `${formatNumber(s.cable.today)} m` : '-'}
Install Slingware :  ${d.wireSling.today > 0 ? `${formatNumber(d.wireSling.today)} m` : '- m'}
Install FDT : ${d.fdt.today > 0 ? formatNumber(d.fdt.today) : ''}
Install FAT : ${d.fat.today > 0 ? formatNumber(d.fat.today) : '0'}
Install JC : ${s.jc.today > 0 ? formatNumber(s.jc.today) : '0'}`;
  };

  const buildWaText = () => {
    if (reportsData.length === 0) return '';
    const isSingle = reportsData.length === 1;
    return reportsData
      .map((item) => formatSingleClusterReport(item, isSingle))
      .join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
  };

  const generatedWaText = buildWaText();
  const currentMessageText = customMessage !== null ? customMessage : generatedWaText;

  const handleCopy = async () => {
    saveSettings();
    try {
      await navigator.clipboard.writeText(currentMessageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('Gagal menyalin teks secara otomatis. Silakan salin manual dari kotak teks.');
    }
  };

  const handleOpenWhatsApp = () => {
    saveSettings();
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(currentMessageText)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
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
          {/* Cluster (Multi-Select) & Tanggal Dropdown Selectors */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200/90 rounded-2xl space-y-3 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Multi-Select Cluster Dropdown */}
              <div ref={clusterDropdownRef} className="relative">
                <label className="text-xs font-bold text-emerald-950 block mb-1.5 flex items-center justify-between gap-1.5">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-emerald-700" />
                    <span>Pilih Cluster (Bisa &gt; 1):</span>
                  </span>
                  <span className="text-[10px] font-extrabold bg-emerald-600 text-white px-2 py-0.5 rounded-full">
                    {selectedClusterIds.length} dipilih
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => setClusterDropdownOpen((prev) => !prev)}
                  className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs cursor-pointer flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    {(() => {
                      const names = clustersList
                        .filter((c) => selectedClusterIds.includes(c.id))
                        .map((c) => c.name);
                      if (names.length === 0) return 'Pilih Cluster...';
                      if (names.length === 1) return names[0];
                      if (names.length === 2) return `${names[0]}, ${names[1]}`;
                      return `${names[0]}, ${names[1]} (+${names.length - 2} lainnya)`;
                    })()}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-emerald-700 shrink-0 transition-transform ${clusterDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {clusterDropdownOpen && (
                  <div className="absolute left-0 right-0 z-50 mt-1.5 bg-white rounded-2xl border border-emerald-200 shadow-2xl overflow-hidden animate-in fade-in duration-150">
                    {/* Search + Quick Actions */}
                    <div className="p-2.5 border-b border-slate-100 bg-slate-50 space-y-2">
                      <div className="relative">
                        <input
                          type="text"
                          value={clusterSearch}
                          onChange={(e) => setClusterSearch(e.target.value)}
                          placeholder="Cari nama cluster..."
                          className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none" />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {clustersWithReports.length > 0 && (
                          <button
                            type="button"
                            onClick={handleSelectClustersWithReports}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold transition"
                          >
                            Ada Input Hari Ini ({clustersWithReports.length})
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedClusterIds(clustersList.map((c) => c.id))}
                          className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-[10px] font-bold transition"
                        >
                          Semua ({clustersList.length})
                        </button>
                        {selectedClusterIds.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSelectedClusterIds([selectedClusterIds[0]])}
                            className="px-2 py-1 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-[10px] font-semibold transition"
                          >
                            Reset (1)
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Checkbox List */}
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                      {clustersList
                        .filter((c) =>
                          c.name.toLowerCase().includes(clusterSearch.trim().toLowerCase())
                        )
                        .map((c) => {
                          const isChecked = selectedClusterIds.includes(c.id);
                          const hasReport = clustersWithReports.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleClusterSelection(c.id)}
                              className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition ${
                                isChecked
                                  ? 'bg-emerald-50/80 text-emerald-950 font-bold'
                                  : 'hover:bg-slate-50 text-slate-700 font-medium'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-slate-300 shrink-0" />
                                )}
                                <span className="truncate">{c.name}</span>
                              </div>
                              {hasReport && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 shrink-0">
                                  Ada input
                                </span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-emerald-950 block mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-emerald-700" />
                  <span>Tanggal Input Harian:</span>
                </label>
                <select
                  value={selectedReportDate}
                  onChange={(e) => handleDateSelect(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-xs cursor-pointer"
                >
                  {datesList.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected Cluster Chips */}
            {selectedClusterIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {clustersList
                  .filter((c) => selectedClusterIds.includes(c.id))
                  .map((c) => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-emerald-300 text-[11px] font-bold text-emerald-900"
                    >
                      <span>{c.name}</span>
                      {selectedClusterIds.length > 1 && (
                        <button
                          type="button"
                          onClick={() => toggleClusterSelection(c.id)}
                          className="text-emerald-600 hover:text-rose-600"
                          title={`Hapus ${c.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  ))}
                {clustersWithReports.length > 1 &&
                  clustersWithReports.some((id) => !selectedClusterIds.includes(id)) && (
                    <button
                      type="button"
                      onClick={handleSelectClustersWithReports}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline ml-1"
                    >
                      + Pilih Semua yang Ada Input ({clustersWithReports.length} Cluster)
                    </button>
                  )}
              </div>
            )}
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-500 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-600" />
              <p className="text-sm font-semibold">Mengompilasi data format WhatsApp dari input harian...</p>
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
                      <label className="font-semibold text-slate-600 block mb-1">Site Name (Nama Cluster)</label>
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
                      <label className="font-semibold text-slate-600 block mb-1">Subcon Name (Fix)</label>
                      <input
                        type="text"
                        readOnly
                        value={FIXED_SUBCON_NAME}
                        className="w-full px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg font-semibold text-slate-600 cursor-not-allowed"
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
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">Preview Pesan:</span>
                    {customMessage !== null && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                        Diedit Manual
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {customMessage !== null && (
                      <button
                        type="button"
                        onClick={() => setCustomMessage(null)}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 transition"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset ke Auto</span>
                      </button>
                    )}
                    <span className="text-[11px] text-slate-400">Dapat diedit langsung sebelum dikirim</span>
                  </div>
                </div>
                <div className="relative">
                  <textarea
                    value={currentMessageText}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    rows={15}
                    className="w-full p-4 bg-slate-900 text-emerald-300 font-mono text-xs rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-inner leading-relaxed resize-none selection:bg-emerald-600 selection:text-white"
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
              disabled={loading || reportsData.length === 0}
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>Salin Format WA</span>
            </button>

            <button
              type="button"
              disabled={loading || reportsData.length === 0}
              onClick={handleOpenWhatsApp}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition disabled:opacity-50"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Buka di WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

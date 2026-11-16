import fs from 'fs';
import path from 'path';
import * as excel from 'xlsx';
import timPelaksanaFallback from '@/data/tim-pelaksana.json';
import { prisma } from '@/lib/prisma';

export interface TimPelaksanaOption {
  timPelaksana: string;
  subcon: string;
  tim: string;
}

export function formatTimPelaksanaName(timPelaksana: string, subcon: string): string {
  const leader = timPelaksana.trim();
  const vendor = subcon.trim();
  if (leader && vendor) return `${leader} (${vendor})`;
  return leader || vendor;
}

/**
 * Membaca daftar tim dasar dari TimPelaksana.xlsx (atau fallback JSON).
 */
export function getExcelMasterTeams(): TimPelaksanaOption[] {
  try {
    const filePath = path.join(process.cwd(), 'TimPelaksana.xlsx');
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const wb = excel.read(buffer, { type: 'buffer' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = excel.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

      const seen = new Set<string>();
      const teams: TimPelaksanaOption[] = [];

      for (const row of rows) {
        const timPelaksana = String(row['Tim Pelaksana'] || '').trim();
        const subcon = String(row['Subcon'] || '').trim();
        const timRaw = String(row['Tim'] || '').trim();
        const tim = timRaw || formatTimPelaksanaName(timPelaksana, subcon);

        if (!tim) continue;
        const key = tim.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        teams.push({ timPelaksana, subcon, tim });
      }

      if (teams.length > 0) {
        return teams;
      }
    }
  } catch (err) {
    console.warn('Gagal membaca TimPelaksana.xlsx, menggunakan fallback JSON:', err);
  }

  return timPelaksanaFallback;
}

/**
 * Best-effort menambahkan tim baru ke file TimPelaksana.xlsx lokal.
 * Kegagalan tulis disk (mis. container read-only / ephemeral) diabaikan karena DB adalah sumber permanen.
 */
export function appendTeamToExcelFile(entry: TimPelaksanaOption): void {
  try {
    const filePath = path.join(process.cwd(), 'TimPelaksana.xlsx');
    if (!fs.existsSync(filePath)) return;

    const buffer = fs.readFileSync(filePath);
    const wb = excel.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0] || 'Sheet1';
    const sheet = wb.Sheets[sheetName];
    const rows = excel.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

    const exists = rows.some((r) => {
      const tim = String(r['Tim'] || '').trim().toLowerCase();
      return tim === entry.tim.toLowerCase();
    });

    if (exists) return;

    rows.push({
      'Tim Pelaksana': entry.timPelaksana,
      Subcon: entry.subcon,
      Tim: entry.tim,
    });

    const newSheet = excel.utils.json_to_sheet(rows, {
      header: ['Tim Pelaksana', 'Subcon', 'Tim'],
    });
    wb.Sheets[sheetName] = newSheet;
    excel.writeFile(wb, filePath);
  } catch (err) {
    console.warn('Info: TimPelaksana.xlsx tidak diperbarui di disk (tersimpan di database):', err);
  }
}

/**
 * Menggabungkan daftar master Tim Pelaksana dari TimPelaksana.xlsx + tabel MasterTeam di database.
 */
export async function getMasterTeams(): Promise<TimPelaksanaOption[]> {
  const baseTeams = getExcelMasterTeams();
  const seen = new Set<string>(baseTeams.map((t) => t.tim.toLowerCase()));
  const merged: TimPelaksanaOption[] = [...baseTeams];

  try {
    const dbTeams = await prisma.masterTeam.findMany({
      orderBy: { createdAt: 'asc' },
    });
    for (const row of dbTeams) {
      const key = row.tim.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push({
        timPelaksana: row.timPelaksana.trim(),
        subcon: row.subcon.trim(),
        tim: row.tim.trim(),
      });
    }
  } catch (err) {
    console.warn('Gagal membaca MasterTeam dari database:', err);
  }

  return merged;
}

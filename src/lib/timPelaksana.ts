import fs from 'fs';
import path from 'path';
import * as excel from 'xlsx';
import timPelaksanaFallback from '@/data/tim-pelaksana.json';

export interface TimPelaksanaOption {
  timPelaksana: string;
  subcon: string;
  tim: string;
}

/**
 * Membaca daftar master Tim Pelaksana dari TimPelaksana.xlsx (dengan fallback ke tim-pelaksana.json).
 */
export function getMasterTeams(): TimPelaksanaOption[] {
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
        const tim =
          timRaw ||
          (timPelaksana && subcon ? `${timPelaksana} (${subcon})` : timPelaksana || subcon);

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

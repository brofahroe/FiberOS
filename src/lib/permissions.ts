export type UserRole = 'ADMIN' | 'USER';

export type DailyInputEditScope = 'NONE' | 'OWN' | 'ALL';

export interface UserPermissions {
  dashboardView: boolean;
  dailyInputView: boolean;
  dailyInputCreate: boolean;
  dailyInputEditScope: DailyInputEditScope;
  matrixView: boolean;
  matrixExport: boolean;
  matrixEditStatus: boolean;
  sitelistView: boolean;
  sitelistManage: boolean;
  importBoq: boolean;
  clustersView: boolean;
  clustersEdit: boolean;
}

export type PermissionPresetKey = 'PENGAWAS' | 'PROJECT_ADMIN' | 'VIEWER';

export const ALL_CITIES_TOKEN = 'ALL';
export const DEFAULT_USER_CITY = 'Blora';

export const FULL_PERMISSIONS: UserPermissions = {
  dashboardView: true,
  dailyInputView: true,
  dailyInputCreate: true,
  dailyInputEditScope: 'ALL',
  matrixView: true,
  matrixExport: true,
  matrixEditStatus: true,
  sitelistView: true,
  sitelistManage: true,
  importBoq: true,
  clustersView: true,
  clustersEdit: true,
};

export const PRESET_PENGAWAS: UserPermissions = {
  dashboardView: true,
  dailyInputView: true,
  dailyInputCreate: true,
  dailyInputEditScope: 'OWN',
  matrixView: true,
  matrixExport: true,
  matrixEditStatus: false,
  sitelistView: true,
  sitelistManage: false,
  importBoq: false,
  clustersView: true,
  clustersEdit: false,
};

export const PRESET_PROJECT_ADMIN: UserPermissions = {
  ...FULL_PERMISSIONS,
};

export const PRESET_VIEWER: UserPermissions = {
  dashboardView: true,
  dailyInputView: true,
  dailyInputCreate: false,
  dailyInputEditScope: 'NONE',
  matrixView: true,
  matrixExport: false,
  matrixEditStatus: false,
  sitelistView: true,
  sitelistManage: false,
  importBoq: false,
  clustersView: true,
  clustersEdit: false,
};

export const PERMISSION_PRESETS: Record<
  PermissionPresetKey,
  { label: string; description: string; permissions: UserPermissions }
> = {
  PENGAWAS: {
    label: 'Pengawas Lapangan',
    description: 'Lihat semua data, tambah & edit laporan milik sendiri, ekspor/WA',
    permissions: PRESET_PENGAWAS,
  },
  PROJECT_ADMIN: {
    label: 'Admin Proyek / BOQ',
    description: 'Akses penuh seluruh fitur proyek kecuali Manajemen User',
    permissions: PRESET_PROJECT_ADMIN,
  },
  VIEWER: {
    label: 'Viewer (Read-Only)',
    description: 'Hanya melihat Dashboard, Matriks, Sitelist, dan Cluster & BOQ',
    permissions: PRESET_VIEWER,
  },
};

export function normalizePermissions(raw: unknown, role: UserRole): UserPermissions {
  if (role === 'ADMIN') {
    return { ...FULL_PERMISSIONS };
  }

  let parsed: Record<string, unknown> | null = null;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        parsed = obj as Record<string, unknown>;
      }
    } catch {
      parsed = null;
    }
  } else if (raw && typeof raw === 'object') {
    parsed = raw as Record<string, unknown>;
  }

  if (!parsed) {
    return { ...PRESET_PENGAWAS };
  }

  const editScopeRaw = parsed.dailyInputEditScope;
  const dailyInputEditScope: DailyInputEditScope =
    editScopeRaw === 'ALL' || editScopeRaw === 'OWN' || editScopeRaw === 'NONE'
      ? editScopeRaw
      : PRESET_PENGAWAS.dailyInputEditScope;

  const boolOr = (key: keyof Omit<UserPermissions, 'dailyInputEditScope'>, fallback: boolean) =>
    typeof parsed?.[key] === 'boolean' ? (parsed[key] as boolean) : fallback;

  return {
    dashboardView: boolOr('dashboardView', PRESET_PENGAWAS.dashboardView),
    dailyInputView: boolOr('dailyInputView', PRESET_PENGAWAS.dailyInputView),
    dailyInputCreate: boolOr('dailyInputCreate', PRESET_PENGAWAS.dailyInputCreate),
    dailyInputEditScope,
    matrixView: boolOr('matrixView', PRESET_PENGAWAS.matrixView),
    matrixExport: boolOr('matrixExport', PRESET_PENGAWAS.matrixExport),
    matrixEditStatus: boolOr('matrixEditStatus', PRESET_PENGAWAS.matrixEditStatus),
    sitelistView: boolOr('sitelistView', PRESET_PENGAWAS.sitelistView),
    sitelistManage: boolOr('sitelistManage', PRESET_PENGAWAS.sitelistManage),
    importBoq: boolOr('importBoq', PRESET_PENGAWAS.importBoq),
    clustersView: boolOr('clustersView', PRESET_PENGAWAS.clustersView),
    clustersEdit: boolOr('clustersEdit', PRESET_PENGAWAS.clustersEdit),
  };
}

export function normalizeAllowedCities(raw: unknown, role: UserRole): string[] {
  if (role === 'ADMIN') {
    return [ALL_CITIES_TOKEN];
  }

  let list: unknown[] | null = null;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = null;
    }
  } else if (Array.isArray(raw)) {
    list = raw;
  }

  if (!list || list.length === 0) {
    return [DEFAULT_USER_CITY];
  }

  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const str = String(item ?? '').trim();
    if (!str) continue;
    if (str.toUpperCase() === ALL_CITIES_TOKEN) {
      return [ALL_CITIES_TOKEN];
    }
    const lower = str.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      cleaned.push(str);
    }
  }

  return cleaned.length > 0 ? cleaned : [DEFAULT_USER_CITY];
}

export function hasAllCitiesAccess(user: { role: UserRole; allowedCities: string[] }): boolean {
  if (user.role === 'ADMIN') return true;
  return user.allowedCities.some((c) => c.trim().toUpperCase() === ALL_CITIES_TOKEN);
}

export function canAccessCity(
  user: { role: UserRole; allowedCities: string[] },
  city?: string | null
): boolean {
  if (hasAllCitiesAccess(user)) return true;
  const target = (city || DEFAULT_USER_CITY).trim().toLowerCase();
  return user.allowedCities.some((allowed) => allowed.trim().toLowerCase() === target);
}

export function hasAnyDailyInputAccess(perms: UserPermissions): boolean {
  return perms.dailyInputView || perms.dailyInputCreate || perms.dailyInputEditScope !== 'NONE';
}

export function isOwnDailyReport(
  user: { username: string; fullName: string },
  reporterName?: string | null
): boolean {
  const rep = (reporterName || '').trim().toLowerCase();
  if (!rep) return false;
  return (
    rep === user.fullName.trim().toLowerCase() ||
    rep === user.username.trim().toLowerCase()
  );
}

export function canEditOrDeleteDailyReport(
  user: {
    role: UserRole;
    username: string;
    fullName: string;
    permissions: UserPermissions;
  },
  reporterName?: string | null
): boolean {
  if (user.role === 'ADMIN') return true;
  if (user.permissions.dailyInputEditScope === 'ALL') return true;
  if (user.permissions.dailyInputEditScope === 'OWN') {
    return isOwnDailyReport(user, reporterName);
  }
  return false;
}

export function getFirstAllowedPath(user: {
  role: UserRole;
  permissions: UserPermissions;
}): string {
  if (user.role === 'ADMIN') return '/';
  const p = user.permissions;
  if (p.dashboardView) return '/';
  if (hasAnyDailyInputAccess(p)) return '/daily-input';
  if (p.matrixView) return '/matrix';
  if (p.sitelistView || p.sitelistManage) return '/sitelist';
  if (p.clustersView || p.clustersEdit) return '/clusters';
  if (p.importBoq) return '/import-boq';
  return '/profile';
}

export function summarizePermissionsCount(perms: UserPermissions): {
  activeCount: number;
  totalCount: number;
} {
  const flags = [
    perms.dashboardView,
    perms.dailyInputView,
    perms.dailyInputCreate,
    perms.dailyInputEditScope !== 'NONE',
    perms.matrixView,
    perms.matrixExport,
    perms.matrixEditStatus,
    perms.sitelistView,
    perms.sitelistManage,
    perms.importBoq,
    perms.clustersView,
    perms.clustersEdit,
  ];
  return {
    activeCount: flags.filter(Boolean).length,
    totalCount: flags.length,
  };
}

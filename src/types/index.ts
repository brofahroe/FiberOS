export interface ProjectSummary {
  id: string;
  name: string;
  code: string;
  totalClusters: number;
  totalHomePasses: number;
  overallProgress: number; // percentage 0-100
  totalBoq: number;
  totalInstalled: number;
}

export interface CategoryProgress {
  category: string;
  displayName: string;
  boq: number;
  installed: number;
  unit: string;
  percentage: number;
}

export interface ClusterWithProgress {
  id: string;
  name: string;
  code?: string | null;
  homePasses: number;
  totalBoq: number;
  totalInstalled: number;
  percentage: number;
  clrPercentage: number;
  sfPercentage: number;
  clrContribution: number;
  sfContribution: number;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  workItems: Array<{
    id: string;
    scope?: string;
    workType?: string;
    category: string;
    subCategory?: string | null;
    weight?: number;
    itemName: string;
    unit: string;
    boq: number;
    installed: number;
    remaining: number;
    percentage: number;
    status: string;
  }>;
}

export interface DailyReportInput {
  clusterId: string;
  reportDate: string;
  reporterName: string;
  teamName: string;
  weather?: string;
  notes?: string;
  photos?: string[];
  items: Array<{
    workItemId: string;
    quantity: number;
  }>;
}

export interface MatrixRow {
  workItemId: string;
  clusterName: string;
  homePasses: number | string;
  category: string;
  itemName: string;
  dailyValues: { [dateStr: string]: number };
  totalInstalled: number;
  boq: number;
  remaining: number;
  percentage: number;
  status: string; // ONGOING, DONE, HOLD
}


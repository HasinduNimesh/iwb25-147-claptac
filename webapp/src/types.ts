export type TariffType = 'TOU' | 'BLOCK';

export interface TariffWindow {
  name: string;
  startTime: string;
  endTime: string;
  rateLKR: number;
}

export interface BlockRateForm {
  r0_30: string;
  r31_60: string;
  r61_90: string;
  r91_120: string;
  r121_180: string;
  r180p: string;
  fixed: string;
  startDate: string;
  usedUnits: string;
}

export interface TouRateForm {
  offpeak: string;
  day: string;
  peak: string;
  fixed: string;
}

export interface ApplianceForm {
  name: string;
  watts: number;
  minutes: number;
  earliest: string;
  latest: string;
  perWeek: number;
}

export type Co2Mode = 'default' | 'constant' | 'profile';

export interface SolarForm {
  has: boolean;
  scheme: string;
  exportRate: string;
  profile: string;
}

export interface Recommendation {
  id: string;
  taskId?: string;
  applianceId: string;
  suggestedStart: string;
  durationMinutes: number;
  reasons: string[];
  justifications: string[];
  estSavingLKR: number;
  costRs?: number;
  co2Kg?: number;
}

export interface RecommendationSets {
  balanced: Recommendation[];
  cheapest: Recommendation[];
  greenest: Recommendation[];
}

export interface BillPreview {
  estimatedKWh: number;
  estimatedCostLKR: number;
  note?: string;
}

export interface MonthlyProjection {
  totalKWh: number;
  totalCostRs: number;
  totalCO2Kg: number;
  treesRequired: number;
}

export interface UserProfile {
  id: string;
  email: string;
  mobile?: string | null;
  nic?: string | null;
  cebAccountNo?: string | null;
  role: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export interface SchedulerVariantsResponse {
  plan: Recommendation[];
  balanced: Recommendation[];
  cheapest: Recommendation[];
  greenest: Recommendation[];
}

export interface AuthResponse {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
  error?: string;
}

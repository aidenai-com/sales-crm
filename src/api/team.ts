import type { Health, Id } from '@/types/domain'
import { api } from './client'

/**
 * The admin-only team overview.
 *
 * Kept out of `endpoints.ts` because it is the one part of the API a rep can never reach:
 * calling it returns 403. Separating it makes that boundary visible in the file tree
 * rather than buried among endpoints everyone uses.
 */

interface StageSliceDto {
  stageId: string
  stageName: string
  stageShortName: string
  color: string
  count: number
  value: string
}

interface RepDto {
  userId: string
  name: string
  initials: string
  jobTitle: string
  role: 'admin' | 'rep'
  openCount: number
  openValue: string
  atRiskCount: number
  closingThisWeekCount: number
  wonCount: number
  wonValue: string
  recentActivityCount: number
  stalledCount: number
  stageSlices: StageSliceDto[]
}

interface StaleDealDto {
  deal: { id: string; name: string; accountName: string; value: string; stageName: string; health: Health }
  ownerName: string
  daysSinceTouch: number | null
}

interface TeamOverviewDto {
  reps: RepDto[]
  staleDeals: StaleDealDto[]
  totalOpenValue: string
  totalAtRisk: number
}

export interface StageSlice {
  stageId: Id
  stageName: string
  stageShortName: string
  color: string
  count: number
  value: number
}

export interface RepPerformance {
  userId: Id
  name: string
  initials: string
  jobTitle: string
  role: 'admin' | 'rep'
  openCount: number
  openValue: number
  atRiskCount: number
  closingThisWeekCount: number
  wonCount: number
  wonValue: number
  recentActivityCount: number
  stalledCount: number
  stageSlices: StageSlice[]
}

export interface StaleDeal {
  id: Id
  name: string
  accountName: string
  value: number
  stageName: string
  health: Health
  ownerName: string
  daysSinceTouch: number | null
}

export interface TeamOverview {
  reps: RepPerformance[]
  staleDeals: StaleDeal[]
  totalOpenValue: number
  totalAtRisk: number
}

export const teamApi = {
  overview: () =>
    api.get<TeamOverviewDto>('/team/overview').then(
      (dto): TeamOverview => ({
        // Money crosses the wire as a decimal string; see endpoints.ts.
        reps: dto.reps.map((r) => ({
          ...r,
          openValue: Number(r.openValue),
          wonValue: Number(r.wonValue),
          stageSlices: r.stageSlices.map((s) => ({ ...s, value: Number(s.value) })),
        })),
        staleDeals: dto.staleDeals.map((s) => ({
          id: s.deal.id,
          name: s.deal.name,
          accountName: s.deal.accountName,
          value: Number(s.deal.value),
          stageName: s.deal.stageName,
          health: s.deal.health,
          ownerName: s.ownerName,
          daysSinceTouch: s.daysSinceTouch,
        })),
        totalOpenValue: Number(dto.totalOpenValue),
        totalAtRisk: dto.totalAtRisk,
      }),
    ),
}

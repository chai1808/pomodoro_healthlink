import { STORAGE_KEYS } from './constants'
import { getTodayKey } from './utils'
import type { DailyUsage } from '../types'

export const loadDailyUsage = (): DailyUsage => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.dailyUsage)
    if (!raw) return { date: getTodayKey(), completedSessions: 0 }

    const parsed = JSON.parse(raw) as DailyUsage
    if (parsed.date !== getTodayKey()) {
      return { date: getTodayKey(), completedSessions: 0 }
    }
    return parsed
  } catch {
    return { date: getTodayKey(), completedSessions: 0 }
  }
}

export const saveDailyUsage = (usage: DailyUsage): void => {
  localStorage.setItem(STORAGE_KEYS.dailyUsage, JSON.stringify(usage))
}

export const incrementDailySession = (): DailyUsage => {
  const usage = loadDailyUsage()
  const updated: DailyUsage = {
    date: getTodayKey(),
    completedSessions: usage.completedSessions + 1,
  }
  saveDailyUsage(updated)
  return updated
}

export const isSessionLimitReached = (maxSessions: number): boolean =>
  loadDailyUsage().completedSessions >= maxSessions

import type { CivilDateTime } from './types'

export const formatCivilDate = (civil?: CivilDateTime): string => {
  if (!civil?.date) return ''
  const { year = 0, month = 0, day = 0 } = civil.date
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export const formatCivilTime = (civil?: CivilDateTime, iso?: string): string => {
  if (civil) {
    const h = civil.time?.hours ?? 0
    const m = civil.time?.minutes ?? 0
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  if (!iso) return '--:--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export const toCivilDate = (date: Date): CivilDateTime => ({
  date: { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() },
})

export const isoDate = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const isoDateFromTimestamp = (iso?: string): string => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return isoDate(date)
}

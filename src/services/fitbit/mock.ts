import type { SleepRecord, ActivityData } from '../../types'

const formatDate = (daysAgo: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split('T')[0]
}

export const MOCK_SLEEP_RECORDS: SleepRecord[] = [
  {
    date: formatDate(1),
    sleepStart: '23:15',
    wakeTime: '06:15',
    minutesAsleep: 420,
  },
  {
    date: formatDate(2),
    sleepStart: '00:30',
    wakeTime: '07:00',
    minutesAsleep: 390,
  },
  {
    date: formatDate(3),
    sleepStart: '22:45',
    wakeTime: '06:15',
    minutesAsleep: 450,
  },
]

export const MOCK_ACTIVITY: ActivityData = {
  currentWeekSteps: [8200, 9100, 7800, 8500, 7200, 9500, 8800],
  last4WeeksSteps: [7500, 8000, 8200, 7800, 7600, 8100, 7900],
  dailySteps: [
    { date: formatDate(6), steps: 8200 },
    { date: formatDate(5), steps: 9100 },
    { date: formatDate(4), steps: 7800 },
    { date: formatDate(3), steps: 8500 },
    { date: formatDate(2), steps: 7200 },
    { date: formatDate(1), steps: 9500 },
    { date: formatDate(0), steps: 8800 },
  ],
}

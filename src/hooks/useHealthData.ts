import { useCallback, useEffect, useState } from 'react'
import { buildHealthSnapshot } from '../lib/healthJudgment'
import { resolveUserLocation } from '../lib/location'
import {
  fetchFitbitData,
  handleFitbitCallback,
  isFitbitConfigured,
} from '../services/fitbit/api'
import { fetchWeather } from '../services/weather/api'
import type { HealthSnapshot } from '../types'

type HealthDataState = {
  snapshot: HealthSnapshot | null
  loading: boolean
  error: string | null
  fitbitConfigured: boolean
}

export const useHealthData = () => {
  const [state, setState] = useState<HealthDataState>({
    snapshot: null,
    loading: true,
    error: null,
    fitbitConfigured: isFitbitConfigured(),
  })

  const loadData = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      loading: prev.snapshot === null,
      error: null,
    }))

    try {
      await handleFitbitCallback()

      const location = await resolveUserLocation()

      const [fitbit, weather] = await Promise.all([
        fetchFitbitData(),
        fetchWeather(location),
      ])

      const snapshot = buildHealthSnapshot(
        fitbit.sleepRecords,
        fitbit.activity,
        weather,
      )

      setState({
        snapshot,
        loading: false,
        error: null,
        fitbitConfigured: isFitbitConfigured(),
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'データ取得に失敗しました'

      setState((prev) => ({
        ...prev,
        loading: false,
        error: prev.snapshot ? null : message,
      }))
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  return { ...state, refresh: loadData }
}

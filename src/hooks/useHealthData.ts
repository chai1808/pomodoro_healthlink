import { useCallback, useEffect, useState } from 'react'
import { buildHealthSnapshot } from '../lib/healthJudgment'
import {
  fetchFitbitData,
  getStoredToken,
  handleFitbitCallback,
  isFitbitConfigured,
} from '../services/fitbit/api'
import { fetchWeather } from '../services/weather/api'
import type { HealthSnapshot } from '../types'

type HealthDataState = {
  snapshot: HealthSnapshot | null
  loading: boolean
  refreshing: boolean
  error: string | null
  isMock: boolean
  fitbitConfigured: boolean
}

export const useHealthData = () => {
  const [state, setState] = useState<HealthDataState>({
    snapshot: null,
    loading: true,
    refreshing: false,
    error: null,
    isMock: true,
    fitbitConfigured: isFitbitConfigured(),
  })

  const loadData = useCallback(async () => {
    setState((prev) => {
      const silent = prev.snapshot !== null
      return {
        ...prev,
        loading: silent ? false : true,
        refreshing: silent,
        error: null,
      }
    })

    try {
      await handleFitbitCallback()

      const token = getStoredToken()
      const fitbitConfigured = isFitbitConfigured()

      const [fitbit, weather] = await Promise.all([
        fetchFitbitData(),
        fetchWeather(),
      ])

      const snapshot = buildHealthSnapshot(
        fitbit.sleepRecords,
        fitbit.activity,
        weather,
      )

      setState({
        snapshot,
        loading: false,
        refreshing: false,
        error: null,
        isMock: !token,
        fitbitConfigured,
      })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'データ取得に失敗しました'

      setState((prev) => ({
        ...prev,
        loading: false,
        refreshing: false,
        error: prev.snapshot ? null : message,
      }))
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  return { ...state, refresh: loadData }
}

import { useCallback, useEffect, useState } from 'react'
import { buildHealthSnapshot } from '../lib/healthJudgment'
import { resolveUserLocation } from '../lib/location'
import {
  disconnectHealth,
  fetchHealthData,
  handleOAuthCallback,
  isHealthConfigured,
  isHealthConnected,
} from '../services/googleHealth/api'
import { fetchWeather } from '../services/weather/api'
import type { HealthSnapshot } from '../types'

type HealthDataState = {
  snapshot: HealthSnapshot | null
  loading: boolean
  error: string | null
  healthConfigured: boolean
  healthConnected: boolean
}

export const useHealthData = () => {
  const [state, setState] = useState<HealthDataState>({
    snapshot: null,
    loading: true,
    error: null,
    healthConfigured: isHealthConfigured(),
    healthConnected: isHealthConnected(),
  })

  const loadData = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      loading: prev.snapshot === null,
      error: null,
    }))

    try {
      const oauth = await handleOAuthCallback()

      const location = await resolveUserLocation()
      const [health, weather] = await Promise.all([
        fetchHealthData(),
        fetchWeather(location),
      ])

      const snapshot = buildHealthSnapshot(health.sleepRecords, health.activity, weather)

      setState({
        snapshot,
        loading: false,
        error: oauth.ok ? null : `Google 連携に失敗しました: ${oauth.message}`,
        healthConfigured: isHealthConfigured(),
        healthConnected: isHealthConnected(),
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
    void loadData()
  }, [loadData])

  const disconnect = useCallback(() => {
    disconnectHealth()
    void loadData()
  }, [loadData])

  return { ...state, refresh: loadData, disconnect }
}

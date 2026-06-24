import { Redis } from '@upstash/redis'
import { sendPushNotification } from './webPush.js'

const DUE_KEY = 'push:due'
const ITEM_PREFIX = 'push:item:'
const ENDPOINT_PREFIX = 'push:endpoint:'

const endpointKey = (endpoint) =>
  `${ENDPOINT_PREFIX}${Buffer.from(endpoint).toString('base64url')}`

const itemKey = (id) => `${ITEM_PREFIX}${id}`

const createScheduleId = (endpoint, endAt) =>
  `${Buffer.from(endpoint).toString('base64url').slice(0, 24)}-${endAt}`

const getRedis = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

const memorySchedules = new Map()
let memoryDispatcherStarted = false

const startMemoryDispatcher = () => {
  if (memoryDispatcherStarted) return
  memoryDispatcherStarted = true
  setInterval(() => {
    void dispatchDuePushes()
  }, 15_000)
}

const normalizePhase = (phase, subscription) => {
  const endAt = Number(phase.endAt)
  if (!Number.isFinite(endAt) || endAt <= Date.now()) return null

  const endpoint = subscription?.endpoint
  if (!endpoint) return null

  const tag = phase.tag ?? `pomodoro-${endAt}`

  return {
    id: createScheduleId(endpoint, endAt),
    endAt,
    subscription,
    title: phase.title ?? 'Pomodoro Healthlink',
    body: phase.body ?? '',
    tag,
    endpoint,
  }
}

export const schedulePushNotifications = async (subscription, phases) => {
  const endpoint = subscription?.endpoint
  if (!endpoint) {
    throw new Error('invalid_subscription')
  }

  const items = (phases ?? [])
    .map((phase) => normalizePhase(phase, subscription))
    .filter(Boolean)

  await cancelPushNotifications(endpoint)

  if (items.length === 0) return { scheduled: 0 }

  const redis = getRedis()

  if (redis) {
    const ids = items.map((item) => item.id)
    await redis.set(endpointKey(endpoint), ids)

    for (const item of items) {
      await redis.set(itemKey(item.id), item)
      await redis.zadd(DUE_KEY, { score: item.endAt, member: item.id })
    }

    return { scheduled: items.length, storage: 'redis' }
  }

  startMemoryDispatcher()
  const ids = []

  for (const item of items) {
    memorySchedules.set(item.id, item)
    ids.push(item.id)
  }

  memorySchedules.set(endpointKey(endpoint), ids)
  return { scheduled: items.length, storage: 'memory' }
}

export const cancelPushNotifications = async (endpoint) => {
  if (!endpoint) return

  const redis = getRedis()

  if (redis) {
    const ids = (await redis.get(endpointKey(endpoint))) ?? []
    for (const id of ids) {
      await redis.del(itemKey(id))
      await redis.zrem(DUE_KEY, id)
    }
    await redis.del(endpointKey(endpoint))
    return
  }

  const ids = memorySchedules.get(endpointKey(endpoint)) ?? []
  for (const id of ids) {
    memorySchedules.delete(id)
  }
  memorySchedules.delete(endpointKey(endpoint))
}

const dispatchItems = async (items) => {
  let sent = 0

  for (const item of items) {
    try {
      await sendPushNotification(item.subscription, {
        title: item.title,
        body: item.body,
        tag: item.tag,
      })
      sent += 1
    } catch (error) {
      const statusCode = error?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        await cancelPushNotifications(item.endpoint)
      }
    }
  }

  return sent
}

export const dispatchDuePushes = async () => {
  const now = Date.now()
  const redis = getRedis()

  if (redis) {
    const dueIds = await redis.zrange(DUE_KEY, 0, now, { byScore: true })
    if (!dueIds?.length) return { sent: 0, due: 0 }

    const items = []
    for (const id of dueIds) {
      const item = await redis.get(itemKey(id))
      if (item) items.push(item)
      await redis.del(itemKey(id))
      await redis.zrem(DUE_KEY, id)
    }

    for (const item of items) {
      const ids = (await redis.get(endpointKey(item.endpoint))) ?? []
      const nextIds = ids.filter((id) => id !== item.id)
      if (nextIds.length === 0) {
        await redis.del(endpointKey(item.endpoint))
      } else {
        await redis.set(endpointKey(item.endpoint), nextIds)
      }
    }

    const sent = await dispatchItems(items)
    return { sent, due: dueIds.length, storage: 'redis' }
  }

  const dueItems = [...memorySchedules.entries()]
    .filter(([key, item]) => !key.startsWith(ENDPOINT_PREFIX) && item.endAt <= now)
    .map(([, item]) => item)

  for (const item of dueItems) {
    memorySchedules.delete(item.id)
    const ids = memorySchedules.get(endpointKey(item.endpoint)) ?? []
    const nextIds = ids.filter((id) => id !== item.id)
    if (nextIds.length === 0) {
      memorySchedules.delete(endpointKey(item.endpoint))
    } else {
      memorySchedules.set(endpointKey(item.endpoint), nextIds)
    }
  }

  const sent = await dispatchItems(dueItems)
  return { sent, due: dueItems.length, storage: 'memory' }
}

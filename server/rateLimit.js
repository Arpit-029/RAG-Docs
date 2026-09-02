const localCounters = new Map()

function clientIp(request) {
  return request.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || request.headers["x-real-ip"]
    || request.socket?.remoteAddress
    || "unknown"
}

function redisConfiguration() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  }
}

function counterKey(scope, ip, counter, now) {
  const bucket = Math.floor(now / (counter.windowSeconds * 1000))
  return `aeos:${scope}:${ip}:${counter.name}:${bucket}`
}

function retryAfter(counter, now) {
  const windowMs = counter.windowSeconds * 1000
  return Math.max(1, Math.ceil((windowMs - (now % windowMs)) / 1000))
}

function consumeLocally(scope, ip, counters, now) {
  if (localCounters.size > 2_000) localCounters.clear()

  return counters.map(counter => {
    const key = counterKey(scope, ip, counter, now)
    const value = (localCounters.get(key) || 0) + counter.cost
    localCounters.set(key, value)
    return value
  })
}

async function consumeRemotely(configuration, scope, ip, counters, now) {
  const commands = []
  counters.forEach(counter => {
    const key = counterKey(scope, ip, counter, now)
    commands.push(["INCRBY", key, counter.cost])
    commands.push(["EXPIRE", key, counter.windowSeconds * 2])
  })

  const response = await fetch(`${configuration.url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  })
  if (!response.ok) throw new Error(`Durable rate limiter failed (${response.status})`)
  const results = await response.json()
  return counters.map((_, index) => Number(results[index * 2]?.result))
}

export async function consumeRateLimit(request, { scope, counters }) {
  const now = Date.now()
  const ip = clientIp(request)
  const configuration = redisConfiguration()
  let values

  if (configuration.url && configuration.token) {
    try {
      values = await consumeRemotely(configuration, scope, ip, counters, now)
    } catch (error) {
      if (process.env.VERCEL_ENV === "production") {
        return { allowed: false, status: 503, message: "The usage limiter is temporarily unavailable.", retryAfter: 30 }
      }
      console.warn(error)
      values = consumeLocally(scope, ip, counters, now)
    }
  } else if (process.env.VERCEL_ENV === "production") {
    return { allowed: false, status: 503, message: "Managed API access requires a durable rate-limit store.", retryAfter: 30 }
  } else {
    values = consumeLocally(scope, ip, counters, now)
  }

  const exceededIndex = counters.findIndex((counter, index) => values[index] > counter.limit)
  if (exceededIndex === -1) return { allowed: true }
  const counter = counters[exceededIndex]
  return { allowed: false, status: 429, message: counter.message, retryAfter: retryAfter(counter, now) }
}

export function sendLimitResponse(response, result) {
  response.setHeader("Retry-After", String(result.retryAfter || 30))
  return response.status(result.status || 429).json({ error: { message: result.message } })
}

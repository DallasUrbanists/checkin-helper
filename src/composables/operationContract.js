export const MAX_TARGETS = 100
export const MAX_PAYLOAD_BYTES = 1_048_576

export function clientActionId(now = Date.now()) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  let timestamp = BigInt(now)
  for (let index = 5; index >= 0; index--) {
    bytes[index] = Number(timestamp & 255n)
    timestamp >>= 8n
  }
  bytes[6] = (bytes[6] & 15) | 112
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function recordId(value) {
  if ((typeof value !== 'string' && typeof value !== 'number') ||
    (typeof value === 'number' && !Number.isSafeInteger(value)) || !/^\d+$/.test(String(value))) {
    throw new Error('A valid record ID is required.')
  }
  const id = BigInt(value)
  if (id < 1n || id > 9223372036854775807n) throw new Error('A valid record ID is required.')
  return id.toString()
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

// Mirror accepted command normalization solely for the server's per-action byte limit.
function normalizedCommand(resource, body) {
  if (resource !== 'contacts') return body || {}
  return Object.fromEntries(Object.entries(body || {}).map(([field, value]) => {
    if (field === 'name') return [field, value.trim().toUpperCase()]
    if (Array.isArray(value)) {
      const list = value.map(item => item.trim()).filter(Boolean).map(item => {
        if (field === 'emails') return item.toLowerCase()
        if (field !== 'phones') return item
        const digits = item.replace(/\D/g, '')
        const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
        if (local.length === 10) return `+1-${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`
        return digits.length > 11 && item.startsWith('+') ? `+${digits}` : item
      })
      return [field, list.length ? list : null]
    }
    return [field, value == null ? null : value.trim() || null]
  }))
}

export function payloadBytes(begin, mutations) {
  const manifest = [...begin.manifest].sort((a, b) =>
    `${a.resource}:${a.record_id}`.localeCompare(`${b.resource}:${b.record_id}`))
  const encoder = new globalThis.TextEncoder()
  return encoder.encode(canonical({ ...begin, manifest })).length + mutations.reduce((total, item) =>
    total + encoder.encode(canonical({ resource: item.resource, record_id: item.id, action: item.action,
      command: normalizedCommand(item.resource, item.body) })).length, 0)
}

export function latestCommitted(history) {
  return history.filter(group => group.status === 'committed').reduce((latest, group) =>
    !latest || BigInt(group.commit_order) > BigInt(latest.commit_order) ? group : latest, null)
}

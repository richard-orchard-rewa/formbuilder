// Dates as RAWA staff read them: Perth time.
const TZ = "Australia/Perth"

const perthDay = (date: Date) => date.toLocaleDateString("en-CA", { timeZone: TZ })

export function isToday(iso: string | null) {
  return iso ? perthDay(new Date(iso)) === perthDay(new Date()) : false
}

export function formatDate(iso: string | null) {
  if (!iso) return "Not booked"
  return new Date(iso).toLocaleDateString("en-AU", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" })
}

export function formatTime(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleTimeString("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit" })
}

export function formatDateTime(iso: string | null) {
  return iso ? `${formatDate(iso)} · ${formatTime(iso)}` : "Not booked"
}

export function todayHeading() {
  return new Date()
    .toLocaleDateString("en-AU", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })
    .toUpperCase()
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((part) => part && part !== "&")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()

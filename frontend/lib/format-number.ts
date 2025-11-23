export const formatCount = (value?: number | null) => {
  if (!value || !Number.isFinite(value)) return "0"
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return Math.trunc(value).toString()
}

export const formatCountWithPlus = (value?: number | null) => {
  const formatted = formatCount(value)
  return formatted !== "0" ? `${formatted}+` : "0"
}

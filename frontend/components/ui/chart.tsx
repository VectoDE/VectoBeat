"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

const THEMES = { light: "", dark: ".dark" } as const

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & ({ color?: string; theme?: never } | { color?: never; theme: Record<keyof typeof THEMES, string> })
}

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }
  return context
}

type ChartContainerProps = React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"]
}

function ChartContainer({ id, className, children, config, ...props }: ChartContainerProps) {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden flex aspect-video justify-center text-xs",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )
}

const ChartStyle = ({ id, config }: { id: string; config: ChartConfig }) => {
  const colorConfig = Object.entries(config).filter(([, cfg]) => cfg.theme || cfg.color)

  if (!colorConfig.length) {
    return null
  }

  const styles = Object.entries(THEMES)
    .map(
      ([theme, prefix]) => `
${prefix} [data-chart=${id}] {
${colorConfig
  .map(([key, cfg]) => {
    const color = cfg.theme?.[theme as keyof typeof cfg.theme] || cfg.color
    return color ? `  --color-${key}: ${color};` : null
  })
  .filter(Boolean)
  .join("\n")}
}
`,
    )
    .join("\n")

  return <style dangerouslySetInnerHTML={{ __html: styles }} />
}

const ChartTooltip = RechartsPrimitive.Tooltip

type TooltipItem = {
  color?: string
  dataKey?: string | number
  name?: string | number
  value?: number
  payload?: Record<string, any>
}

interface ChartTooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  active?: boolean
  payload?: TooltipItem[]
  label?: string | number
  labelFormatter?: (label?: string | number, payload?: TooltipItem[]) => React.ReactNode
  labelClassName?: string
  formatter?: (
    value?: number,
    name?: string | number,
    item?: TooltipItem,
    index?: number,
    payload?: Record<string, any>,
  ) => React.ReactNode
  hideLabel?: boolean
  hideIndicator?: boolean
  indicator?: "line" | "dot" | "dashed"
  nameKey?: string
  labelKey?: string
  color?: string
}

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  nameKey,
  labelKey,
  color,
  ...props
}: ChartTooltipContentProps) {
  const { config } = useChart()
  const typedPayload = payload ?? []

  if (!active || !typedPayload?.length) {
    return null
  }

  const nestLabel = typedPayload.length > 1 && !!label
  const tooltipLabel = labelFormatter ? labelFormatter(label, typedPayload) : label
  const fallbackColor =
    typeof color === "string" ? color : typedPayload[0]?.payload?.[nameKey || "fill"] ?? typedPayload[0]?.color

  return (
    <div
      className={cn(
        "grid gap-1.5 rounded-md border border-border/50 bg-card/80 px-3 py-2 text-xs shadow-md backdrop-blur",
        className,
      )}
      {...props}
    >
      {!hideLabel && tooltipLabel && (
        <div
          className={cn(
            "flex items-center gap-2 border-b border-border/40 pb-1 text-muted-foreground",
            labelClassName,
            nestLabel && "justify-between text-foreground",
          )}
        >
          {nestLabel && <span className="text-muted-foreground">Total</span>}
          <span className="font-semibold text-foreground">{tooltipLabel}</span>
        </div>
      )}
      <div className="grid gap-1.5">
        {typedPayload.map((item, index) => {
          if (!item || typeof item.value === "undefined") return null

          const key = `${labelKey || nameKey || item.name || index}`
          const configEntry = getPayloadConfigFromPayload(config, item, key)
          const indicatorColor = color || item.color || configEntry?.color || fallbackColor

          return (
            <div
              key={`${item.dataKey ?? index}-${index}`}
              className={cn("flex items-center gap-2 rounded-md px-2 py-1", {
                "border border-border/40 bg-card/60": nestLabel,
              })}
            >
              {configEntry?.icon ? (
                <configEntry.icon />
              ) : (
                !hideIndicator && (
                  <div
                    className={cn("shrink-0 rounded-[2px]", {
                      "h-2.5 w-2.5": indicator === "dot",
                      "w-1 h-3": indicator === "line",
                      "w-0 border border-dashed bg-transparent": indicator === "dashed",
                    })}
                    style={{ backgroundColor: indicator === "dot" ? indicatorColor : "transparent", borderColor: indicatorColor ?? color }}
                  />
                )
              )}

              <div className="flex flex-1 items-center justify-between gap-6">
                <span className="text-muted-foreground">
                  {configEntry?.label ?? item.name ?? item.dataKey ?? "Value"}
                </span>
                <span className="font-mono font-medium text-foreground tabular-nums">
                  {typeof formatter === "function"
                    ? formatter(item.value, item.name ?? "", item, index, item.payload)
                    : typeof item.value === "number"
                      ? item.value.toLocaleString()
                      : String(item.value ?? "")}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const ChartLegend = RechartsPrimitive.Legend

type LegendItem = {
  dataKey?: string | number
  value?: string | number
  color?: string
  payload?: Record<string, any>
}

interface ChartLegendContentProps extends React.HTMLAttributes<HTMLDivElement> {
  payload?: LegendItem[]
  verticalAlign?: "top" | "middle" | "bottom"
  hideIcon?: boolean
  nameKey?: string
}

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: ChartLegendContentProps) {
  const { config } = useChart()
  const typedPayload = payload ?? []

  if (!typedPayload?.length) {
    return null
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4 text-xs",
        verticalAlign === "top" ? "pb-3" : "pt-3",
        className,
      )}
    >
      {typedPayload.map((item) => {
        const key = `${nameKey || item.dataKey || item.value || "value"}`
        const configEntry = getPayloadConfigFromPayload(config, item, key)
        return (
          <div
            key={`${item.value}-${item.dataKey}`}
            className="[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3"
          >
            {configEntry?.icon && !hideIcon ? (
              <configEntry.icon />
            ) : (
              <div className="h-2 w-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
            )}
            <span className="text-foreground/70">{configEntry?.label ?? item.value}</span>
          </div>
        )
      })}
    </div>
  )
}

function getPayloadConfigFromPayload(config: ChartConfig, payload: LegendItem | TooltipItem, key: string) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadObject = "payload" in payload ? payload.payload : undefined

  let resolvedKey = key
  if (payloadObject && typeof payloadObject === "object" && resolvedKey in payloadObject) {
    const candidate = payloadObject[resolvedKey as keyof typeof payloadObject]
    if (typeof candidate === "string") {
      resolvedKey = candidate
    }
  }

  return resolvedKey in config ? config[resolvedKey] : config[key]
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent, ChartStyle }

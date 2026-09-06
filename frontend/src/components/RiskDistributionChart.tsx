import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Severity } from '../types'
import { severityHex } from '../lib/ui'

interface Row {
  severity: Severity
  count: number
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: Row }[]
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-pop">
      <span className="font-medium text-ink">{row.severity}</span>
      <span className="ml-2 text-muted">
        {row.count} finding{row.count === 1 ? '' : 's'}
      </span>
    </div>
  )
}

/** Severity breakdown for the selected assessment. */
export function RiskDistributionChart({ data }: { data: Row[] }) {
  const total = data.reduce((sum, row) => sum + row.count, 0)

  if (total === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted">
        No findings in this assessment yet, so there is no distribution to show.
      </p>
    )
  }

  return (
    <div className="h-52 w-full px-2 pb-2 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }} barCategoryGap="28%">
          <XAxis
            dataKey="severity"
            tick={{ fill: '#8d95a6', fontSize: 11 }}
            axisLine={{ stroke: '#232936' }}
            tickLine={false}
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: '#646c7c', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={34}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: '#171b22' }} />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((row) => (
              <Cell key={row.severity} fill={severityHex[row.severity]} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

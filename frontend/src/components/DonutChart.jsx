import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import useLanguage from '../hooks/useLanguage'
import { presentNumber } from '../utils/presentation'

const SIZE = 152
const RADIUS = 56
const STROKE = 16
const CENTER = SIZE / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const MOTION = 'stroke-dasharray 650ms cubic-bezier(.2,.8,.2,1), stroke-dashoffset 650ms cubic-bezier(.2,.8,.2,1)'

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches))
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

// Two-segment accessible donut. Center and legend read the same result, so a
// month or currency change can never leave numbers and proportions out of step.
export default function DonutChart({ title, tone = 'provincial', segments, total, centerUnit, centerLabel, footer, actionHref, actionLabel, emptyLabel = 'برای این دوره فعالیتی ثبت نشده است.' }) {
  const { ui } = useLanguage()
  const reduced = useReducedMotion()
  const [armed, setArmed] = useState(reduced)
  useEffect(() => {
    if (reduced) return
    const frame = requestAnimationFrame(() => setArmed(true))
    return () => cancelAnimationFrame(frame)
  }, [reduced])

  const safeTotal = Number(total) || 0
  const arcs = segments.map((segment, index) => {
    const value = Number(segment.value) || 0
    const fraction = safeTotal > 0 ? value / safeTotal : 0
    const prior = safeTotal > 0
      ? segments.slice(0, index).reduce((sum, item) => sum + (Number(item.value) || 0), 0) / safeTotal
      : 0
    return { ...segment, value, fraction, length: armed ? fraction * CIRCUMFERENCE : 0, offset: -prior * CIRCUMFERENCE }
  })
  const summary = safeTotal > 0
    ? segments.map(segment => `${ui(segment.label)}: ${presentNumber(segment.value)} ${segment.unit || ''}`.trim()).join('، ')
    : ui(emptyLabel)

  return <section className="ws-chart-panel" data-tone={tone}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-base font-bold">{ui(title)}</h3>
      {actionHref && <Link className="ws-chart-action" to={actionHref}>{ui(actionLabel)}</Link>}
    </header>
    <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label={`${ui(title)}. ${summary}`}>
          <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="currentColor" className="ws-chart-track" strokeWidth={STROKE}/>
          {arcs.map(arc => <circle key={arc.label} cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke={arc.color} strokeWidth={STROKE} strokeLinecap="butt"
            strokeDasharray={`${arc.length} ${Math.max(CIRCUMFERENCE - arc.length, 0)}`} strokeDashoffset={arc.offset}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            style={{ transition: reduced ? 'none' : MOTION }}/>)}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span dir="ltr" className="ws-chart-center text-2xl font-bold tabular-nums">{presentNumber(safeTotal)}</span>
          <span className="mt-0.5 text-xs font-semibold ws-chart-muted">{ui(centerUnit)}</span>
          <span className="text-[11px] ws-chart-muted">{ui(centerLabel)}</span>
        </div>
      </div>
      <div className="w-full min-w-0">
        {safeTotal === 0
          ? <p className="ws-chart-empty">{ui(emptyLabel)}</p>
          : <ul className="space-y-2">
            {arcs.map(arc => <li key={arc.label} className="ws-chart-legend">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: arc.color }}/>
                <span className="break-words font-semibold">{ui(arc.label)}</span>
              </span>
              <span dir="ltr" className="shrink-0 tabular-nums font-bold">{presentNumber(arc.value)}<small className="ms-1 text-xs font-semibold ws-chart-muted">{arc.unit || ''}</small></span>
            </li>)}
          </ul>}
        {footer && <div className="ws-chart-footer">{footer}</div>}
      </div>
    </div>
  </section>
}

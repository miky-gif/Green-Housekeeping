/** Histogramme « nettoyages évités par jour » (maquettes 2a et 2f). */
export interface Bar {
  key: string;
  label: string;
  value: number;
  today?: boolean;
}

function niceMax(v: number): { max: number; step: number } {
  if (v <= 4) return { max: 4, step: 1 };
  if (v <= 8) return { max: 8, step: 2 };
  const step = Math.ceil(v / 4 / 5) * 5 || 5;
  return { max: step * 4, step };
}

export default function BarChart({ bars, height = 240, average, gridStep }: { bars: Bar[]; height?: number; average?: number; gridStep?: number }) {
  const peak = Math.max(1, ...bars.map((b) => b.value));
  const { max, step: autoStep } = niceMax(peak);
  const step = gridStep ?? autoStep;
  const ticks: number[] = [];
  for (let t = max; t >= 0; t -= step) ticks.push(t);
  const dense = bars.length > 10;
  const summary = bars.map((b) => `${b.label} : ${b.value}`).join(', ');

  return (
    <figure className="m-0 flex flex-col gap-2" aria-label={`Nettoyages évités par jour. ${summary}.`}>
      <div className="relative grid grid-cols-[28px_minmax(0,1fr)]" style={{ height }}>
        <div className="relative" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-2 -translate-y-1/2 text-[12px] tabular-nums text-ink-500" style={{ top: `${(1 - t / max) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="relative">
          {ticks.map((t) => (
            <span key={t} aria-hidden className="absolute left-0 right-0 h-px bg-line" style={{ top: `${(1 - t / max) * 100}%` }} />
          ))}
          {average !== undefined && average > 0 && (
            <span aria-hidden className="absolute left-0 right-0 border-t-2 border-dashed border-ink-300" style={{ top: `${(1 - average / max) * 100}%` }} />
          )}
          <div className="absolute inset-0 grid items-end" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }} aria-hidden>
            {bars.map((b) => (
              <div key={b.key} className="flex h-full flex-col items-center justify-end gap-1.5">
                {!dense && <span className="text-[12px] font-semibold leading-none tabular-nums text-ink-900">{b.value}</span>}
                <span
                  className="rounded-t-[6px] bg-brand-500"
                  title={`${b.label} : ${b.value}`}
                  style={{ width: dense ? '62%' : 'min(44px, 60%)', height: `${(b.value / max) * 100}%`, opacity: b.today ? 0.85 : 1, minHeight: b.value ? 2 : 0 }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[28px_minmax(0,1fr)]">
        <span />
        <div className="grid text-center text-[12px] text-ink-500" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
          {bars.map((b, i) => (
            <span key={b.key} className={b.today ? 'font-semibold text-ink-900' : undefined}>
              {dense ? (i % 5 === 4 || b.today ? b.label : '') : b.label}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}

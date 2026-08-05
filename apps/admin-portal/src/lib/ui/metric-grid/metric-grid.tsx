/**
 * A single cell in the {@link MetricGrid}: a labelled headline number. `value`
 * (and the optional `delta`) arrive already formatted for display — the grid is
 * purely presentational and does no number/currency formatting itself.
 */
export type Metric = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly delta?: string;
  readonly hint?: string;
};

/**
 * The dashboard's compact metric strip: a responsive, data-agnostic grid of
 * headline numbers. It renders exactly the metrics it is handed, in order, and
 * owns none of the data — callers pass preformatted {@link Metric}s.
 */
export function MetricGrid({
  metrics,
}: {
  readonly metrics: readonly Metric[];
}) {
  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-secondary-500/15 bg-secondary-500/15 sm:grid-cols-3 lg:grid-cols-6">
      {metrics.map((metric) => (
        <div
          key={metric.key}
          className="flex flex-col gap-0.5 bg-surface-50 px-4 py-3"
        >
          <span className="font-subheading text-[11px] font-medium uppercase tracking-wide text-on-surface-50/55">
            {metric.label}
          </span>
          <span className="font-heading text-xl font-semibold text-ink">
            {metric.value}
          </span>
          {(metric.delta ?? metric.hint) ?
            <span className="text-[11px] text-on-surface-50/50">
              {metric.delta ?? metric.hint}
            </span>
          : null}
        </div>
      ))}
    </section>
  );
}

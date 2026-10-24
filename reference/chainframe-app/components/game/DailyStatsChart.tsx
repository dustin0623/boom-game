"use client";
import { useState } from "react";
import type { GameStatsDailyDto } from "@/lib/api/types";
import { GAME_STATS_DEFINITIONS } from "@/lib/api/types";
import { formatGameStatValue } from "@/lib/format";

/** One currency/count scale at a time; bars and table share the same data. */
export function DailyStatsChart({
  data,
  series,
}: {
  data: GameStatsDailyDto;
  series: number;
}) {
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, data.points.length - 1);
  const definition = GAME_STATS_DEFINITIONS[data.metric].series[series];
  const max = Math.max(0, ...data.points.map((point) => point.values[series]));
  const ceiling = max || 1;
  const ticks = [
    ...new Set([
      0,
      definition.unit === "count" ? Math.floor(max / 2) : max / 2,
      max,
    ]),
  ];
  const width = 900,
    height = 240,
    left = 160,
    bottom = 190;
  const step = (width - left - 16) / data.points.length;
  const select = (next: number) => {
    setSelected(next);
    document.getElementById(`daily-stat-bar-${next}`)?.focus();
  };
  const point = data.points[index];
  return (
    <div className="min-w-0 space-y-3">
      <p className="text-sm font-semibold">
        Period total:{" "}
        {formatGameStatValue(data.totals[series], definition.unit)}
      </p>
      {max === 0 ? (
        <p className="text-xs text-muted-foreground">
          No completed activity in this period.
        </p>
      ) : null}
      <div className="min-w-0 overflow-x-auto rounded-md border border-border bg-muted/10">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block w-full"
          style={{ minWidth: Math.max(600, data.points.length * 14) }}
          role="group"
          aria-label={`Daily ${definition.label}, UTC`}
        >
          {ticks.map((value) => (
            <g key={value}>
              <line
                x1={left}
                x2={width - 16}
                y1={bottom - (value / ceiling) * 155}
                y2={bottom - (value / ceiling) * 155}
                stroke="currentColor"
                opacity="0.12"
              />
              <text
                x={left - 8}
                y={bottom - (value / ceiling) * 155 + 4}
                textAnchor="end"
                fontSize="10"
                fill="currentColor"
              >
                {formatGameStatValue(value, definition.unit)}
              </text>
            </g>
          ))}
          {data.points.map((entry, i) => {
            const barHeight = (entry.values[series] / ceiling) * 155;
            return (
              <g key={entry.day}>
                <rect
                  x={left + i * step + 1}
                  y={bottom - Math.max(2, barHeight)}
                  width={Math.max(2, step - 2)}
                  height={Math.max(2, barHeight)}
                  className={i === index ? "fill-primary" : "fill-primary/50"}
                  opacity={entry.values[series] === 0 ? 0.2 : 1}
                  aria-hidden="true"
                  pointerEvents="none"
                />
                <rect
                  id={`daily-stat-bar-${i}`}
                  x={left + i * step}
                  y={bottom - 155}
                  width={step}
                  height={155}
                  className="fill-transparent focus-visible:stroke-primary focus-visible:outline-none"
                  role="button"
                  tabIndex={i === index ? 0 : -1}
                  aria-label={`${entry.day} UTC: ${formatGameStatValue(entry.values[series], definition.unit)}`}
                  onPointerEnter={() => setSelected(i)}
                  onPointerDown={() => setSelected(i)}
                  onFocus={() => setSelected(i)}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    select(
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? data.points.length - 1
                          : Math.max(
                              0,
                              Math.min(
                                data.points.length - 1,
                                i + (event.key === "ArrowLeft" ? -1 : 1),
                              ),
                            ),
                    );
                  }}
                >
                  <title>
                    {entry.day}:{" "}
                    {formatGameStatValue(entry.values[series], definition.unit)}
                  </title>
                </rect>
                {i % Math.max(1, Math.ceil(data.points.length / 7)) === 0 ||
                i === data.points.length - 1 ? (
                  <text
                    x={left + i * step + step / 2}
                    y={215}
                    textAnchor="middle"
                    fontSize="10"
                    fill="currentColor"
                  >
                    {entry.day.slice(5)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
      >
        {point
          ? `${point.day} UTC: ${formatGameStatValue(point.values[series], definition.unit)}`
          : "No daily values"}
      </p>
      <details className="rounded-md border border-border p-3 text-xs">
        <summary className="cursor-pointer font-medium">
          Daily values (UTC)
        </summary>
        <div className="mt-3 max-h-52 overflow-auto">
          <table className="w-full text-left">
            <caption className="sr-only">
              Daily {definition.label} in UTC
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="text-right">
                  {definition.label}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.points.map((entry) => (
                <tr key={entry.day}>
                  <th scope="row" className="py-1 font-normal">
                    {entry.day}
                  </th>
                  <td className="text-right font-mono">
                    {formatGameStatValue(entry.values[series], definition.unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

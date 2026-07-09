import { useMemo, useState } from "react";
import type { CanvasArtifact, CanvasScalar } from "./types.js";

const SERIES_COLORS = ["#68b7c8", "#72d38d", "#e0ad5b", "#e67f86", "#7d9de8", "#c18ae0"];

export function CanvasPanel(props: { artifact: CanvasArtifact | null; onRefresh: () => void }) {
  return (
    <section className="canvas-panel" aria-labelledby="canvas-title">
      <CanvasHeader artifact={props.artifact} onRefresh={props.onRefresh} />
      {!props.artifact ? <div className="canvas-empty"><p>No canvas artifact yet.</p></div> : null}
      {props.artifact?.kind === "chart" ? <ChartCanvas key={props.artifact.id} artifact={props.artifact} /> : null}
      {props.artifact?.kind === "table" ? <TableCanvas key={props.artifact.id} artifact={props.artifact} /> : null}
      {props.artifact?.kind === "board" ? <BoardCanvas key={props.artifact.id} artifact={props.artifact} /> : null}
    </section>
  );
}

function CanvasHeader(props: { artifact: CanvasArtifact | null; onRefresh: () => void }) {
  return (
    <header className="canvas-header">
      <div>
        <p className="eyebrow">Live Canvas</p>
        <h2 id="canvas-title">{props.artifact?.title ?? "Canvas"}</h2>
        {props.artifact?.subtitle ? <p className="canvas-subtitle">{props.artifact.subtitle}</p> : null}
      </div>
      <button type="button" className="icon-button" onClick={props.onRefresh} aria-label="Refresh canvas" title="Refresh canvas">↻</button>
      {props.artifact ? <p className="canvas-provenance">{props.artifact.source.tool} · {formatTimestamp(props.artifact.createdAt)}</p> : null}
    </header>
  );
}

function ChartCanvas({ artifact }: { artifact: Extract<CanvasArtifact, { kind: "chart" }> }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = artifact.chart.series.filter((series) => !hidden.has(series.name));
  const max = Math.max(1, ...visible.flatMap((series) => series.values.map(Math.abs)));
  function toggle(name: string) {
    setHidden((current) => { const next = new Set(current); next.has(name) ? next.delete(name) : next.add(name); return next; });
  }
  return (
    <div className="chart-canvas">
      <div className="chart-legend" aria-label="Chart series">
        {artifact.chart.series.map((series, index) => <button key={series.name} type="button" aria-pressed={!hidden.has(series.name)} onClick={() => toggle(series.name)}><i style={{ background: series.color ?? SERIES_COLORS[index] }} />{series.name}</button>)}
      </div>
      <svg viewBox="0 0 600 280" role="img" aria-label={`${artifact.title}, ${artifact.chart.type} chart`}>
        <ChartGrid max={max} />
        {artifact.chart.type === "bar" ? <Bars artifact={artifact} visible={visible} max={max} /> : <Lines artifact={artifact} visible={visible} max={max} />}
        {artifact.chart.categories.map((label, index) => <text key={`${label}-${index}`} x={chartX(index, artifact.chart.categories.length)} y="262" textAnchor="middle">{shortLabel(label)}</text>)}
      </svg>
      {artifact.chart.xLabel || artifact.chart.yLabel ? <p className="axis-labels"><span>{artifact.chart.yLabel}</span><span>{artifact.chart.xLabel}</span></p> : null}
    </div>
  );
}

function ChartGrid({ max }: { max: number }) {
  return <g className="chart-grid">{[0, 1, 2, 3, 4].map((tick) => { const y = 230 - tick * 48; return <g key={tick}><line x1="48" y1={y} x2="580" y2={y} /><text x="40" y={y + 4} textAnchor="end">{compact(max * tick / 4)}</text></g>; })}</g>;
}

function Bars(props: { artifact: Extract<CanvasArtifact, { kind: "chart" }>; visible: { name: string; color?: string; values: number[] }[]; max: number }) {
  const count = props.artifact.chart.categories.length;
  const groupWidth = 500 / count;
  const width = Math.max(3, Math.min(28, (groupWidth - 10) / Math.max(1, props.visible.length)));
  return <g>{props.visible.flatMap((series) => series.values.map((value, index) => { const height = Math.abs(value) / props.max * 192; const seriesIndex = props.artifact.chart.series.findIndex((item) => item.name === series.name); return <rect key={`${series.name}-${index}`} x={chartX(index, count) - props.visible.length * width / 2 + props.visible.indexOf(series) * width} y={230 - height} width={width - 2} height={height} rx="2" fill={series.color ?? SERIES_COLORS[seriesIndex]}><title>{`${series.name}: ${value}`}</title></rect>; }))}</g>;
}

function Lines(props: { artifact: Extract<CanvasArtifact, { kind: "chart" }>; visible: { name: string; color?: string; values: number[] }[]; max: number }) {
  const count = props.artifact.chart.categories.length;
  return <g>{props.visible.map((series) => { const seriesIndex = props.artifact.chart.series.findIndex((item) => item.name === series.name); const color = series.color ?? SERIES_COLORS[seriesIndex]; const points = series.values.map((value, index) => `${chartX(index, count)},${230 - Math.abs(value) / props.max * 192}`).join(" "); return <g key={series.name}><polyline points={points} fill="none" stroke={color} strokeWidth="3" />{series.values.map((value, index) => <circle key={index} cx={chartX(index, count)} cy={230 - Math.abs(value) / props.max * 192} r="4" fill={color}><title>{`${series.name}: ${value}`}</title></circle>)}</g>; })}</g>;
}

function TableCanvas({ artifact }: { artifact: Extract<CanvasArtifact, { kind: "table" }> }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; direction: 1 | -1 } | null>(null);
  const rows = useMemo(() => {
    const filtered = artifact.table.rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase())));
    return sort ? [...filtered].sort((a, b) => compare(a[sort.key], b[sort.key]) * sort.direction) : filtered;
  }, [artifact, query, sort]);
  function sortBy(key: string) { setSort((current) => ({ key, direction: current?.key === key && current.direction === 1 ? -1 : 1 })); }
  return (
    <div className="table-canvas">
      <label className="canvas-search">Filter rows<input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search this table" /></label>
      <div className="canvas-table-wrap"><table><thead><tr>{artifact.table.columns.map((column) => <th key={column.key}><button type="button" onClick={() => sortBy(column.key)} aria-label={`Sort by ${column.label}`}>{column.label}<span>{sort?.key === column.key ? (sort.direction === 1 ? "↑" : "↓") : "↕"}</span></button></th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{artifact.table.columns.map((column) => <td key={column.key}>{formatCell(row[column.key], column.format)}</td>)}</tr>)}</tbody></table></div>
      <p className="canvas-count" aria-live="polite">{rows.length} of {artifact.table.rows.length} rows</p>
    </div>
  );
}

function BoardCanvas({ artifact }: { artifact: Extract<CanvasArtifact, { kind: "board" }> }) {
  const first = artifact.board.columns[0]?.items[0];
  const [selected, setSelected] = useState(first);
  return (
    <div className="board-canvas">
      <div className="board-columns">{artifact.board.columns.map((column) => <section key={column.title} className="board-column"><h3>{column.title}<span>{column.items.length}</span></h3>{column.items.map((item, index) => <button key={`${item.title}-${index}`} type="button" className={selected === item ? "selected" : ""} onClick={() => setSelected(item)}><strong>{item.title}</strong>{item.status ? <span>{item.status}</span> : null}{item.metric ? <b>{item.metric}</b> : null}</button>)}</section>)}</div>
      {selected ? <aside className="board-detail" aria-live="polite"><p className="eyebrow">Selected</p><h3>{selected.title}</h3>{selected.status ? <span>{selected.status}</span> : null}<p>{selected.detail ?? "No additional detail."}</p>{selected.metric ? <strong>{selected.metric}</strong> : null}</aside> : null}
    </div>
  );
}

function chartX(index: number, count: number): number { return count === 1 ? 314 : 64 + index * (500 / (count - 1)); }
function shortLabel(value: string): string { return value.length > 10 ? `${value.slice(0, 9)}…` : value; }
function compact(value: number): string { return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : Number(value.toFixed(1)).toString(); }
function compare(a: CanvasScalar | undefined, b: CanvasScalar | undefined): number { return typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? "")); }
function formatCell(value: CanvasScalar | undefined, format?: string): string { if (value === null || value === undefined) return "—"; if (typeof value !== "number") return String(value); if (format === "currency") return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); if (format === "percent") return `${value}%`; return value.toLocaleString(); }
function formatTimestamp(value: string): string { return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }

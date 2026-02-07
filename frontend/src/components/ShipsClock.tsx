import { useState, useRef, useCallback } from "react";

const PRESETS: { label: string; sub: string; value: number | null }[] = [
  { label: "5m", sub: "Dog Watch", value: 5 },
  { label: "15m", sub: "Quarter Bell", value: 15 },
  { label: "30m", sub: "Half Bell", value: 30 },
  { label: "1h", sub: "One Bell", value: 60 },
  { label: "4h", sub: "Full Watch", value: 240 },
  { label: "8h", sub: "Double Watch", value: 480 },
  { label: "24h", sub: "Full Day", value: 1440 },
  { label: "All", sub: "Ship's Log", value: null },
];

// Slider stops (in minutes) — logarithmic-ish spacing
const SLIDER_STOPS = [5, 10, 15, 30, 45, 60, 120, 240, 480, 720, 1440];
const SLIDER_MAX = SLIDER_STOPS.length - 1;

function minutesToSlider(minutes: number | null): number {
  if (minutes === null) return SLIDER_MAX;
  for (let i = 0; i < SLIDER_STOPS.length; i++) {
    if (SLIDER_STOPS[i] >= minutes) return i;
  }
  return SLIDER_MAX;
}

function sliderToMinutes(idx: number): number | null {
  if (idx >= SLIDER_MAX) return null;
  return SLIDER_STOPS[idx];
}

function formatWindow(minutes: number | null): string {
  if (minutes === null) return "All time";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${minutes / 60}h`;
  return "24h";
}

interface Props {
  value: number | null;
  onChange: (minutes: number | null) => void;
  compact?: boolean;
}

const COMPACT_PRESETS = PRESETS.filter((p) =>
  ["5m", "1h", "24h", "All"].includes(p.label)
);

export function ShipsClock({ value, onChange, compact }: Props) {
  const [expanded, setExpanded] = useState(false);
  const sliderRef = useRef<HTMLInputElement>(null);

  const handleSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(sliderToMinutes(Number(e.target.value)));
    },
    [onChange]
  );

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20">
      {/* Compact bar */}
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 border border-[#2a1f0e]/60"
        style={{ background: "linear-gradient(180deg, #1a150a 0%, #0d1928 100%)" }}
      >
        {/* Clock icon + expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-amber-600/80 hover:text-amber-400 transition-colors text-sm select-none"
          title="Ship's Clock"
        >
          {expanded ? "▾" : "▸"}
        </button>

        <span
          className="text-[10px] text-amber-100/60 uppercase tracking-widest select-none"
          style={{ fontFamily: "'Pirata One', cursive", fontSize: "11px" }}
        >
          Lookback
        </span>

        <div className="w-px h-4 bg-[#2a1f0e]/60" />

        {/* Quick presets */}
        {(compact ? COMPACT_PRESETS : PRESETS).map((p) => (
          <button
            key={p.label}
            onClick={() => onChange(p.value)}
            title={p.sub}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
              value === p.value
                ? "bg-amber-700/60 text-amber-100 shadow-inner"
                : "text-slate-500 hover:text-amber-200 hover:bg-[#2a1f0e]/40"
            }`}
            style={{ fontFamily: "'Pirata One', cursive" }}
          >
            {p.label}
          </button>
        ))}

        {/* Current window display */}
        <div className="w-px h-4 bg-[#2a1f0e]/60" />
        <span className="text-[10px] text-amber-200/70 min-w-[3rem] text-center">
          {formatWindow(value)}
        </span>
      </div>

      {/* Expanded slider panel */}
      {expanded && (
        <div
          className="mt-1 rounded-lg px-4 py-3 border border-[#2a1f0e]/60"
          style={{ background: "linear-gradient(180deg, #1a150a 0%, #0d1928 100%)" }}
        >
          <div className="flex items-center justify-between text-[9px] text-slate-500 uppercase tracking-wider mb-2 px-1">
            <span>5 min</span>
            <span
              className="text-amber-100/50"
              style={{ fontFamily: "'Pirata One', cursive", fontSize: "11px" }}
            >
              Slide to set thy watch
            </span>
            <span>All</span>
          </div>

          {/* Range slider — styled as a ship's instrument */}
          <input
            ref={sliderRef}
            type="range"
            min={0}
            max={SLIDER_MAX}
            step={1}
            value={minutesToSlider(value)}
            onChange={handleSlider}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer
              bg-[#1a3a5c]/40
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-amber-600
              [&::-webkit-slider-thumb]:border-2
              [&::-webkit-slider-thumb]:border-amber-400/60
              [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-moz-range-thumb]:w-4
              [&::-moz-range-thumb]:h-4
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-amber-600
              [&::-moz-range-thumb]:border-2
              [&::-moz-range-thumb]:border-amber-400/60
            "
          />

          {/* Tick marks */}
          <div className="flex justify-between px-1 mt-1">
            {SLIDER_STOPS.map((stop, i) => (
              <div
                key={stop}
                className={`w-px h-2 ${
                  minutesToSlider(value) === i ? "bg-amber-400" : "bg-[#1a3a5c]/60"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

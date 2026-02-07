import type { MapEntity, WhaleAlert } from "../types/whale";
import { geoToPixel, MAP_WIDTH, MAP_HEIGHT } from "../lib/geo";

interface Props {
  entities: MapEntity[];
  whales: WhaleAlert[];
}

export function Compass({ entities, whales }: Props) {
  const size = 140;
  const padding = 8;

  // Minimap scale
  const scaleX = (size - padding * 2) / MAP_WIDTH;
  const scaleY = (size - padding * 2) / MAP_HEIGHT;

  return (
    <div className="absolute left-4 bottom-4 z-20 hidden md:block" title="Here be whales">
      <svg
        width={size}
        height={size}
        className="rounded-full border-2 border-[#2a4a6c] bg-[#0a1628]/90 backdrop-blur-sm shadow-lg"
      >
        {/* Ocean background */}
        <rect width={size} height={size} rx={size / 2} fill="#0a1628" />

        {/* Clip to circle */}
        <defs>
          <clipPath id="minimap-clip">
            <circle cx={size / 2} cy={size / 2} r={size / 2 - 2} />
          </clipPath>
        </defs>

        <g clipPath="url(#minimap-clip)">
          {/* Grid */}
          {[-60, -30, 0, 30, 60].map((lat) => {
            const y = padding + geoToPixel(lat, 0).y * scaleY;
            return (
              <line
                key={`lat-${lat}`}
                x1={padding}
                y1={y}
                x2={size - padding}
                y2={y}
                stroke="#1a3a5c"
                strokeWidth={0.5}
                opacity={0.5}
              />
            );
          })}
          {[-120, -60, 0, 60, 120].map((lon) => {
            const x = padding + geoToPixel(0, lon).x * scaleX;
            return (
              <line
                key={`lon-${lon}`}
                x1={x}
                y1={padding}
                x2={x}
                y2={size - padding}
                stroke="#1a3a5c"
                strokeWidth={0.5}
                opacity={0.5}
              />
            );
          })}

          {/* Islands (entities) */}
          {entities.map((e) => {
            const pos = geoToPixel(e.lat, e.lon);
            return (
              <circle
                key={e.label}
                cx={padding + pos.x * scaleX}
                cy={padding + pos.y * scaleY}
                r={2}
                fill="#3da864"
                opacity={0.7}
              />
            );
          })}

          {/* Whales */}
          {whales.slice(0, 20).map((w, i) => {
            const lat = w.to_lat ?? w.from_lat ?? 0;
            const lon = w.to_lon ?? w.from_lon ?? -160;
            const pos = geoToPixel(lat, lon);
            return (
              <circle
                key={`${w.tx_hash}-${i}`}
                cx={padding + pos.x * scaleX}
                cy={padding + pos.y * scaleY}
                r={1.5}
                fill="#4488ff"
                opacity={0.8}
              />
            );
          })}
        </g>

        {/* Compass rose */}
        <text
          x={size / 2}
          y={14}
          textAnchor="middle"
          fill="#e2d9c0"
          fontSize={9}
          fontWeight="bold"
        >
          N
        </text>
        <text
          x={size / 2}
          y={size - 6}
          textAnchor="middle"
          fill="#8aa0b8"
          fontSize={8}
        >
          S
        </text>
        <text x={8} y={size / 2 + 3} fill="#8aa0b8" fontSize={8}>
          W
        </text>
        <text
          x={size - 8}
          y={size / 2 + 3}
          textAnchor="end"
          fill="#8aa0b8"
          fontSize={8}
        >
          E
        </text>

        {/* Border ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 1}
          fill="none"
          stroke="#2a4a6c"
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}

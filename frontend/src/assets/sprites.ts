/**
 * Inline SVG sprite generation for the sailing-themed map.
 * These create data URI images that Pixi.js can load as textures.
 */

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export const OCEAN_TILE = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <rect width="200" height="200" fill="#0a1628"/>
  <g opacity="0.15" stroke="#1a3a5c" stroke-width="1" fill="none">
    <path d="M0 30 Q25 20 50 30 Q75 40 100 30 Q125 20 150 30 Q175 40 200 30"/>
    <path d="M0 70 Q25 60 50 70 Q75 80 100 70 Q125 60 150 70 Q175 80 200 70"/>
    <path d="M0 110 Q25 100 50 110 Q75 120 100 110 Q125 100 150 110 Q175 120 200 110"/>
    <path d="M0 150 Q25 140 50 150 Q75 160 100 150 Q125 140 150 150 Q175 160 200 150"/>
    <path d="M0 190 Q25 180 50 190 Q75 200 100 190 Q125 180 150 190 Q175 200 200 190"/>
  </g>
  <g opacity="0.08" fill="#2a5a8c">
    <circle cx="30" cy="50" r="1.5"/>
    <circle cx="120" cy="90" r="1"/>
    <circle cx="170" cy="30" r="1.5"/>
    <circle cx="80" cy="160" r="1"/>
    <circle cx="150" cy="140" r="1.5"/>
  </g>
</svg>`);

export const WHALE_SPRITE = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="40" viewBox="0 0 64 40">
  <ellipse cx="28" cy="22" rx="22" ry="12" fill="#3b82f6" opacity="0.9"/>
  <ellipse cx="28" cy="22" rx="18" ry="9" fill="#60a5fa"/>
  <path d="M48 18 Q56 8 62 14 Q58 16 54 20 Z" fill="#3b82f6"/>
  <path d="M48 26 Q56 32 62 26 Q58 24 54 22 Z" fill="#3b82f6"/>
  <circle cx="14" cy="18" r="2.5" fill="#1e293b"/>
  <circle cx="14" cy="18" r="1" fill="white"/>
  <path d="M6 16 Q2 12 4 8" stroke="#93c5fd" stroke-width="2" fill="none" opacity="0.6"/>
  <path d="M6 14 Q0 10 2 6" stroke="#93c5fd" stroke-width="1.5" fill="none" opacity="0.4"/>
  <ellipse cx="24" cy="28" rx="10" ry="3" fill="#2563eb" opacity="0.3"/>
</svg>`);

export const SHIP_SPRITE = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M24 4 L24 32" stroke="#8B4513" stroke-width="2"/>
  <path d="M24 8 L38 20 L24 18 Z" fill="#f5f0e6" stroke="#d4c5a0" stroke-width="0.5"/>
  <path d="M24 8 L10 20 L24 18 Z" fill="#ede4cc" stroke="#d4c5a0" stroke-width="0.5"/>
  <path d="M12 34 Q14 40 24 42 Q34 40 36 34 Z" fill="#8B4513"/>
  <path d="M14 34 Q16 38 24 40 Q32 38 34 34 Z" fill="#A0522D"/>
  <rect x="22" y="2" width="4" height="3" rx="1" fill="#d4a574"/>
</svg>`);

export const WHALE_MINI_SPRITE = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="12" viewBox="0 0 20 12">
  <ellipse cx="9" cy="7" rx="7" ry="4" fill="#3b82f6" opacity="0.9"/>
  <ellipse cx="9" cy="7" rx="5.5" ry="3" fill="#60a5fa"/>
  <path d="M15 5.5 Q18 2.5 19.5 5 Q18 5.5 17 6.5 Z" fill="#3b82f6"/>
  <circle cx="4.5" cy="5.5" r="1" fill="#1e293b"/>
  <circle cx="4.5" cy="5.5" r="0.4" fill="white"/>
</svg>`);

export const ISLAND_SPRITE = svgToDataUri(`
<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <ellipse cx="24" cy="38" rx="18" ry="6" fill="#1a6b3a" opacity="0.4"/>
  <path d="M8 36 Q12 24 20 28 Q16 20 24 18 Q32 16 32 24 Q36 20 40 28 Q44 32 40 36 Z" fill="#2d8a4e"/>
  <path d="M10 36 Q14 28 22 30 Q18 24 24 22 Q30 20 32 26 Q34 22 38 30 Q42 34 38 36 Z" fill="#3da864"/>
  <rect x="22" y="12" width="2" height="12" fill="#8B4513"/>
  <path d="M24 8 Q30 10 28 14 Q26 12 24 12 Z" fill="#2d8a4e"/>
  <path d="M24 8 Q18 10 20 14 Q22 12 24 12 Z" fill="#3da864"/>
</svg>`);

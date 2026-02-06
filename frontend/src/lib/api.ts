import type { MapData, WhalesResponse, WhaleAlert } from "../types/whale";

const BASE = "";

export async function fetchMapData(): Promise<MapData> {
  const res = await fetch(`${BASE}/api/map`);
  if (!res.ok) throw new Error(`Failed to fetch map data: ${res.status}`);
  return res.json();
}

export async function fetchWhales(limit = 100): Promise<WhalesResponse> {
  const res = await fetch(`${BASE}/api/whales?limit=${limit}`);
  if (!res.ok) throw new Error(`Failed to fetch whales: ${res.status}`);
  return res.json();
}

export async function fetchWhaleDetail(
  txHash: string
): Promise<{ alert: WhaleAlert | null }> {
  const res = await fetch(`${BASE}/api/whale/${txHash}`);
  if (!res.ok) throw new Error(`Failed to fetch whale: ${res.status}`);
  return res.json();
}

export function formatUsd(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatAmount(amount: number | null): string {
  if (amount === null) return "?";
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return amount.toFixed(2);
}

export function shortenAddress(addr: string | null): string {
  if (!addr) return "Unknown";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

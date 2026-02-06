export type AlertType =
  | "transfer"
  | "mint"
  | "burn"
  | "dex_trade"
  | "bridge";

export interface WhaleAlert {
  tx_hash: string;
  chain: string;
  block_timestamp: string;
  alert_type: AlertType;
  from_address: string | null;
  to_address: string | null;
  from_label: string | null;
  to_label: string | null;
  asset_symbol: string | null;
  amount: number | null;
  usd_value: number;
  protocol: string | null;
  source_chain: string | null;
  destination_chain: string | null;
  asset_bought_symbol: string | null;
  asset_sold_symbol: string | null;
  amount_bought: number | null;
  amount_sold: number | null;
  // Geo coordinates (enriched by backend)
  from_lat?: number;
  from_lon?: number;
  from_country?: string;
  to_lat?: number;
  to_lon?: number;
  to_country?: string;
}

export interface MapEntity {
  label: string;
  addresses: { address: string; chain: string }[];
  lat: number;
  lon: number;
  country: string;
  discovered?: boolean;
}

export interface MapData {
  entities: MapEntity[];
}

export interface WhalesResponse {
  alerts: WhaleAlert[];
  total: number;
}

export const ALERT_COLORS: Record<AlertType, number> = {
  transfer: 0x4488ff,
  mint: 0x44cc88,
  burn: 0xff4444,
  dex_trade: 0xffcc44,
  bridge: 0xaa66ff,
};

export const ALERT_EMOJI: Record<AlertType, string> = {
  transfer: "🐋",
  mint: "🌊",
  burn: "🔥",
  dex_trade: "💱",
  bridge: "🌉",
};

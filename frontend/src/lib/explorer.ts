const EXPLORER_BASE: Record<string, string> = {
  ethereum: "https://etherscan.io/tx/",
  bitcoin: "https://mempool.space/tx/",
  solana: "https://solscan.io/tx/",
  polygon: "https://polygonscan.com/tx/",
  arbitrum: "https://arbiscan.io/tx/",
  optimism: "https://optimistic.etherscan.io/tx/",
  base: "https://basescan.org/tx/",
  avalanche: "https://snowtrace.io/tx/",
  bsc: "https://bscscan.com/tx/",
  linea: "https://lineascan.build/tx/",
  scroll: "https://scrollscan.com/tx/",
  zksync: "https://explorer.zksync.io/tx/",
  blast: "https://blastscan.io/tx/",
};

const EXPLORER_NAMES: Record<string, string> = {
  ethereum: "Etherscan",
  bitcoin: "Mempool",
  solana: "Solscan",
  polygon: "Polygonscan",
  arbitrum: "Arbiscan",
  optimism: "OP Etherscan",
  base: "Basescan",
  avalanche: "Snowtrace",
  bsc: "BscScan",
  linea: "LineaScan",
  scroll: "ScrollScan",
  zksync: "zkSync Explorer",
  blast: "BlastScan",
};

export function getExplorerTxUrl(
  chain: string,
  txHash: string,
): string | null {
  const base = EXPLORER_BASE[chain.toLowerCase()];
  if (!base) return null;
  return `${base}${txHash}`;
}

export function getExplorerName(chain: string): string {
  return EXPLORER_NAMES[chain.toLowerCase()] ?? "Explorer";
}

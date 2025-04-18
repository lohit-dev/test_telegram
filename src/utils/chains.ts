import { arbitrumSepolia, baseSepolia, monadTestnet, sepolia } from "viem/chains";

export const supportedChains = {
  sepolia: sepolia,
  arbitrum_sepolia: arbitrumSepolia,
  base_sepolia: baseSepolia,
  monad_testnet: monadTestnet,
} as const;

export type SupportedChainId = keyof typeof supportedChains;

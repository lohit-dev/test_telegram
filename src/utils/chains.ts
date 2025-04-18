import { arbitrumSepolia, baseSepolia, sepolia } from "viem/chains";

export const supportedChains = {
  sepolia: sepolia,
  arbitrum_sepolia: arbitrumSepolia,
  base_sepolia: baseSepolia,
} as const;

export type SupportedChainId = keyof typeof supportedChains;

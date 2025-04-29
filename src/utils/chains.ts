import {
  sepolia,
  arbitrumSepolia,
  citreaTestnet,
  berachainTestnet,
  baseSepolia,
  kakarotStarknetSepolia,
} from "viem/chains";
import { hyperliquidTestnet } from "@gardenfi/core";

export const supportedChains = {
  ethereum_sepolia: sepolia,
  arbitrum_sepolia: arbitrumSepolia,
  base_sepolia: baseSepolia,
  citrea_testnet: citreaTestnet,
  berachain_testnet: berachainTestnet,
  hyperliquid_testnet: hyperliquidTestnet,
  starknet_sepolia: kakarotStarknetSepolia,
} as const;

export type SupportedChainId = keyof typeof supportedChains;

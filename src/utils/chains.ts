import { getBitcoinNetwork } from "@gardenfi/core/dist/src/lib/utils";
import { Environment } from "@gardenfi/utils";
import {
  sepolia,
  arbitrumSepolia,
  citreaTestnet,
  berachainTestnet,
  baseSepolia,
} from "viem/chains";

export const supportedChains = {
  sepolia: sepolia,
  arbitrum_sepolia: arbitrumSepolia,
  base_sepolia: baseSepolia,
  citrea_testnet: citreaTestnet,
  berachain_testnet: berachainTestnet,
} as const;

export type SupportedChainId = keyof typeof supportedChains;

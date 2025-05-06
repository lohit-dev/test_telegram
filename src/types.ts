import { Context, SessionFlavor } from "grammy";
import { SwapParams } from "@gardenfi/core";
import { Asset } from "@gardenfi/orderbook";
import { Chain } from "viem";

export interface WalletData {
  address: string;
  privateKey?: string;
  publicKey?: string;
  mnemonic?: string;
  chain: string;
  balance?: string;
  connected: boolean;
  contractDeployed?: boolean;
  client?: any;
}

export type StepType =
  | "initial"
  | "wallet_create"
  | "wallet_import"
  | "wallet_imported"
  | "select_network"
  | "select_from_asset"
  | "select_to_asset"
  | "swap_amount"
  | "selecting_destination"
  | "enter_destination"
  | "confirm_swap"
  | "enter_starknet_address"
  | "register"
  | "login";

export interface SessionData {
  step: StepType;
  wallets: Record<string, WalletData>;
  activeWallet?: string;
  swapParams?: Partial<SwapParams> & {
    fromAsset?: Asset;
    toAsset?: Asset;
    sendAmount?: string;
    destinationAddress?: string;
    selectedNetwork?: Chain;
    networkKey?: string;
  };
  tempData?: {
    mnemonic?: string;
    privateKey?: string;
    importType?: string;
    importChain?: string;
    starknetAddress?: string;
    selectedChain?: string;
    password?: string;
  };
}

export type BotContext = Context & SessionFlavor<SessionData>;

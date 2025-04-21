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
  client?: any;
}

export interface SessionData {
  step:
    | "initial"
    | "wallet_create"
    | "wallet_import"
    | "wallet_imported"
    | "select_network"
    | "select_from_asset"
    | "select_to_asset"
    | "swap_amount"
    | "enter_destination"
    | "confirm_swap"
    | "select_import_chain"
    | "starknet_address_input";
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
  };
}

export type BotContext = Context & SessionFlavor<SessionData>;

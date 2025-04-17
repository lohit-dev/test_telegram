import {
  BitcoinNetwork,
  BitcoinProvider,
  BitcoinWallet,
} from "@catalogfi/wallets";
import { with0x } from "@gardenfi/utils";
import { Chain, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrumSepolia, sepolia } from "viem/chains";
import { logger } from "../utils/logger";
import { ethers, Wallet } from "ethers";
import { WalletData } from "../types";

export class WalletService {
  static async createWallets(chain: Chain) {
    const ethersWallet = Wallet.createRandom();

    const ethPrivateKey = ethersWallet.privateKey;
    const ethAddress = ethersWallet.address;

    const account = privateKeyToAccount(with0x(ethPrivateKey));
    const walletClient = createWalletClient({
      account,
      chain: chain,
      transport: http(),
    });

    const ethWalletData: WalletData = {
      address: ethAddress,
      privateKey: ethPrivateKey,
      publicKey: ethersWallet.publicKey,
      chain: "ethereum",
      connected: true,
      mnemonic: ethersWallet.mnemonic?.phrase,
      client: walletClient,
    };

    const btcWallet = BitcoinWallet.fromPrivateKey(
      ethPrivateKey,
      new BitcoinProvider(BitcoinNetwork.Testnet)
    );
    const btcAddress = await btcWallet.getAddress();
    const btcPubKey = await btcWallet.getPublicKey();

    const btcWalletData: WalletData = {
      address: btcAddress,
      privateKey: ethPrivateKey,
      publicKey: btcPubKey,
      chain: "bitcoin",
      connected: true,
      client: btcWallet,
    };

    return { ethWalletData, btcWalletData };
  }

  static async importFromPrivateKey(
    privateKey: string,
    chain: Chain
  ): Promise<WalletData> {
    try {
      if (chain.name.includes("ethereum") || chain.name.includes("evm")) {
        const wallet = new Wallet(privateKey);
        const account = privateKeyToAccount(with0x(privateKey));
        const walletClient = createWalletClient({
          account,
          chain,
          transport: http(),
        });

        return {
          address: wallet.address,
          privateKey: wallet.privateKey,
          chain: "ethereum",
          connected: true,
          client: walletClient,
        };
      } else if (chain.name.includes("bitcoin") || chain.name.includes("btc")) {
        const btcWallet = BitcoinWallet.fromPrivateKey(
          privateKey,
          new BitcoinProvider(BitcoinNetwork.Testnet)
        );

        const address = await btcWallet.getAddress();
        const pubKey = await btcWallet.getPublicKey();

        return {
          address,
          privateKey,
          publicKey: pubKey,
          chain: "bitcoin",
          connected: true,
          client: btcWallet,
        };
      } else {
        throw new Error(`Unsupported chain: ${chain}`);
      }
    } catch (error) {
      logger.error("Error importing wallet from private key:", error);
      throw error;
    }
  }

  static async importFromMnemonic(
    mnemonic: string,
    chain: Chain
  ): Promise<WalletData> {
    try {
      if (chain.name.includes("ethereum") || chain.name.includes("evm")) {
        const ethersWallet = Wallet.fromPhrase(mnemonic);
        const account = privateKeyToAccount(with0x(ethersWallet.privateKey));
        const walletClient = createWalletClient({
          account,
          chain: chain,
          transport: http(),
        });

        return {
          address: ethersWallet.address,
          privateKey: ethersWallet.privateKey,
          publicKey: ethersWallet.publicKey,
          mnemonic: mnemonic,
          chain: "ethereum",
          connected: true,
          client: walletClient,
        };
      } else if (chain.name.includes("bitcoin") || chain.name.includes("btc")) {
        const btcWallet = BitcoinWallet.fromMnemonic(
          mnemonic,
          new BitcoinProvider(BitcoinNetwork.Testnet)
        );

        const address = await btcWallet.getAddress();
        const pubKey = await btcWallet.getPublicKey();

        return {
          address: address,
          mnemonic: mnemonic,
          publicKey: pubKey,
          chain: "bitcoin",
          connected: true,
          client: btcWallet,
        };
      } else {
        throw new Error(`Unsupported chain: ${chain}`);
      }
    } catch (error) {
      logger.error("Error importing wallet from mnemonic:", error);
      throw error;
    }
  }

  static getEVMWalletClient(privateKey: string, chain: Chain) {
    const account = privateKeyToAccount(with0x(privateKey));
    return createWalletClient({
      transport: http(),
      chain: chain,
      account,
    });
  }

  static getBitcoinWallet(privateKey: string) {
    return BitcoinWallet.fromPrivateKey(
      privateKey,
      new BitcoinProvider(BitcoinNetwork.Testnet)
    );
  }

  static toXOnlyPublicKey(compressedPubKey: string): string {
    return compressedPubKey.slice(2);
  }
}

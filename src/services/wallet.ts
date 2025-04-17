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

interface WalletResponse {
  ethWalletData: WalletData;
  btcWalletData: WalletData;
}

export class WalletService {
  static async createWallets(chain: Chain): Promise<WalletResponse> {
    try {
      
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
        chain: "ethereum",
        connected: true,
        mnemonic: ethersWallet.mnemonic?.phrase,
        client: walletClient,
      };

      
      const btcWallet = BitcoinWallet.fromPrivateKey(
        ethPrivateKey.startsWith("0x") ? ethPrivateKey.slice(2) : ethPrivateKey,
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
        mnemonic: ethersWallet.mnemonic?.phrase,
        client: btcWallet,
      };

      return { ethWalletData, btcWalletData };
    } catch (error) {
      logger.error("Error creating wallets:", error);
      throw error;
    }
  }

  static async importFromPrivateKey(
    privateKey: string,
    chain: Chain
  ): Promise<WalletResponse> {
    try {
      
      const wallet = new Wallet(privateKey);
      const account = privateKeyToAccount(with0x(privateKey));
      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(),
      });

      const ethWalletData: WalletData = {
        address: wallet.address,
        privateKey: wallet.privateKey,
        chain: "ethereum",
        connected: true,
        client: walletClient,
      };

      
      const btcWallet = BitcoinWallet.fromPrivateKey(
        privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey,
        new BitcoinProvider(BitcoinNetwork.Testnet)
      );

      const btcAddress = await btcWallet.getAddress();
      const btcPubKey = await btcWallet.getPublicKey();

      const btcWalletData: WalletData = {
        address: btcAddress,
        privateKey: privateKey,
        publicKey: btcPubKey,
        chain: "bitcoin",
        connected: true,
        client: btcWallet,
      };

      return { ethWalletData, btcWalletData };
    } catch (error) {
      logger.error("Error importing wallets from private key:", error);
      throw error;
    }
  }

  static async importFromMnemonic(
    mnemonic: string,
    chain: Chain
  ): Promise<WalletResponse> {
    try {
      console.log("Starting mnemonic import for phrase:", 
        mnemonic.split(' ').length + " words"); 
      
      
      if (!mnemonic.trim() || mnemonic.split(' ').length < 12) {
        throw new Error("Invalid mnemonic format. Must be 12 or 24 words.");
      }
      
      
      const ethersWallet = Wallet.fromPhrase(mnemonic);
      console.log("Ethereum wallet created from mnemonic");
      
      const account = privateKeyToAccount(with0x(ethersWallet.privateKey));
      const walletClient = createWalletClient({
        account,
        chain: chain,
        transport: http(),
      });

      const ethWalletData: WalletData = {
        address: ethersWallet.address,
        privateKey: ethersWallet.privateKey,
        mnemonic: mnemonic,
        chain: "ethereum",
        connected: true,
        client: walletClient,
      };

      
      const btcWallet = BitcoinWallet.fromMnemonic(
        mnemonic,
        new BitcoinProvider(BitcoinNetwork.Testnet)
      );

      const btcAddress = await btcWallet.getAddress();
      const btcPubKey = await btcWallet.getPublicKey();

      const btcWalletData: WalletData = {
        address: btcAddress,
        mnemonic: mnemonic,
        publicKey: btcPubKey,
        chain: "bitcoin",
        connected: true,
        client: btcWallet,
      };

      return { ethWalletData, btcWalletData };
    } catch (error) {
      logger.error("Error importing wallets from mnemonic:", error);
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

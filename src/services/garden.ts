import { Garden, SecretManager, SwapParams } from "@gardenfi/core";
import { Asset } from "@gardenfi/orderbook";
import { logger } from "../utils/logger";
import { WalletData } from "../types";
import { DigestKey, Environment } from "@gardenfi/utils";
import { config } from "../config";

export class GardenService {
  private garden: Garden;

  //   async getDigestKey(): Promise<DigestKey> {
  //     try {
  //       const digestKey = await DigestKey.from("Hello");

  //       if (!digestKey.ok) {
  //         throw new Error(`Failed to get digest key: ${digestKey.error}`);
  //       }

  //       return digestKey.val;
  //     } catch (error) {
  //       logger.error("Error getting digest key:", error);
  //       throw error;
  //     }
  //   }

  constructor() {}

  initializeGarden(ethWallet: WalletData, btcWallet: WalletData) {
    this.garden = Garden.from({
      environment: Environment.TESTNET,
      digestKey: "hello",
      wallets: {
        evm: ethWallet.client,
        starknet: btcWallet.client,
      },
    });

    this.setupEventListeners();
    return this.garden;
  }

  isInitialized() {
    return this.garden !== null;
  }

  private setupEventListeners() {
    this.garden.on("error", (order, error) => {
      logger.error(`Garden error for order: ${JSON.stringify(order)}`, error);
    });

    this.garden.on("log", (id, message) => {
      logger.info(`Garden log [${id}]: ${message}`);
    });

    this.garden.on("success", (order, action, txHash) => {
      logger.info(
        `Garden success [${action}] for order: ${JSON.stringify(
          order
        )}, txHash: ${txHash}`
      );
    });
  }

  getGarden() {
    return this.garden;
  }

  async generateSecret(wallet: any) {
    try {
      const secretManager = SecretManager.fromWalletClient(wallet);
      const secretResult = await secretManager.generateSecret("2");

      if (!secretResult.ok) {
        throw new Error(`Failed to generate secret: ${secretResult.error}`);
      }

      return secretResult.val;
    } catch (error) {
      logger.error("Error generating secret:", error);
      throw error;
    }
  }

  async getStrategies() {
    try {
      const strategies = await this.garden.quote.getStrategies();

      if (!strategies.ok) {
        throw new Error("Failed to get strategies");
      }

      return strategies.val;
    } catch (error) {
      logger.error("Error getting strategies:", error);
      throw error;
    }
  }

  async getQuote(fromAsset: Asset, toAsset: Asset, amount: number) {
    try {
      const orderPair = this.constructOrderpair(fromAsset, toAsset);
      const quoteResult = await this.garden.quote.getQuote(
        orderPair,
        amount,
        true
      );

      if (!quoteResult.ok) {
        throw new Error(`Failed to get quote: ${quoteResult.error}`);
      }

      return quoteResult.val;
    } catch (error) {
      logger.error("Error getting quote:", error);
      throw error;
    }
  }

  async executeSwap(swapParams: SwapParams) {
    try {
      const swapResult = await this.garden.swap(swapParams);

      if (!swapResult.ok) {
        throw new Error(`Failed to create swap: ${swapResult.error}`);
      }

      return swapResult.val;
    } catch (error) {
      logger.error("Error executing swap:", error);
      throw error;
    }
  }

  async initiateEVMSwap(order: any) {
    try {
      const initResult = await this.garden.evmHTLC?.initiate(order);

      if (!initResult?.ok) {
        throw new Error(`Failed to initiate swap: ${initResult?.error}`);
      }

      return initResult.val;
    } catch (error) {
      logger.error("Error initiating EVM swap:", error);
      throw error;
    }
  }

  async execute() {
    try {
      await this.garden.execute();
    } catch (error) {
      logger.error("Error executing garden:", error);
      throw error;
    }
  }

  constructOrderpair(fromAsset: Asset, toAsset: Asset) {
    return `${fromAsset.chain}:${fromAsset.atomicSwapAddress}::${toAsset.chain}:${toAsset.atomicSwapAddress}`;
  }
}

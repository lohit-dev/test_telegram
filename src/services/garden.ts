import { Garden, SecretManager, SwapParams } from "@gardenfi/core";
import { Asset, SupportedAssets } from "@gardenfi/orderbook";
import { logger } from "../utils/logger";
import { WalletData } from "../types";
import { DigestKey, Environment } from "@gardenfi/utils";
import { config } from "../config";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { with0x } from "@gardenfi/utils";
import { getAccount } from "@catalogfi/wallets/dist/src/lib/bitcoin";

export class GardenService {
  private garden: Garden;

  constructor() {}

  initializeGarden(ethWallet: WalletData, btcWallet: WalletData) {
    try {
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
    } catch (error) {
      logger.error("Error initializing garden:", error);
      throw error;
    }
  }

  createGardenWithNetwork(walletClient: any, networkKey?: string) {
    try {
      logger.info(
        `Creating new Garden instance for network: ${networkKey || "default"}`
      );

      // Create a new Garden instance
      this.garden = Garden.from({
        environment: Environment.TESTNET,
        digestKey: "hello",
        wallets: {
          evm: walletClient,
          starknet: walletClient,
        },
      });

      // Set up event listeners
      this.setupEventListeners();

      logger.info("Created new Garden instance with updated wallet client");
      return this.garden;
    } catch (error) {
      logger.error("Error creating Garden instance:", error);
      throw error;
    }
  }

  isInitialized() {
    return !!this.garden;
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
      const orderPair = this.constructOrderPair(fromAsset, toAsset);
      const quoteResult = await this.garden.quote.getQuote(
        orderPair,
        amount,
        false
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

      const order = swapResult.val;
      logger.info(
        `Order created successfully, id: ${order.create_order.create_id}`
      );

      const initRes = await this.garden.evmHTLC?.initiate(order);

      if (!initRes?.ok) {
        throw new Error(`Failed to initiate swap: ${initRes?.error}`);
      }

      logger.info(`Swap initiated, txHash: ${initRes.val}`);

      this.garden.execute().catch((error) => {
        logger.error("Error during execution:", error);
      });

      return {
        order,
        txHash: initRes.val,
      };
    } catch (error) {
      logger.error("Error executing swap:", error);
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

  constructOrderPair(fromAsset: Asset, toAsset: Asset) {
    return `${fromAsset.chain}:${fromAsset.atomicSwapAddress}::${toAsset.chain}:${toAsset.atomicSwapAddress}`;
  }
}

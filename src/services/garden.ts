import { Garden, SecretManager, SwapParams } from "@gardenfi/core";
import { Asset, SupportedAssets } from "@gardenfi/orderbook";
import { logger } from "../utils/logger";
import { BotContext, WalletData } from "../types";
import { DigestKey, Environment } from "@gardenfi/utils";
import { config } from "../config";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { with0x } from "@gardenfi/utils";
import { getAccount } from "@catalogfi/wallets/dist/src/lib/bitcoin";
import { Bot } from "grammy";

export class GardenService {
  private garden: Garden;
  private bot: Bot<BotContext>;
  private orderUserMap: Map<string, number>;

  constructor(bot: Bot<BotContext>) {
    this.bot = bot;
    this.orderUserMap = new Map<string, number>();
  }

  initializeGarden(ethWallet: WalletData, btcWallet: WalletData) {
    try {
      this.garden = Garden.fromWallets({
        environment: Environment.TESTNET,
        digestKey: DigestKey.generateRandom().val,
        wallets: {
          evm: ethWallet.client,
        },
      });

      this.setupEventListeners();
      return this.garden;
    } catch (error) {
      logger.error("Error initializing garden:", error);
      throw error;
    }
  }

  createGardenWithNetwork(walletClient: any) {
    try {
      logger.info(
        `Creating new Garden instance for wallet: ${walletClient || "default"}`
      );

      this.garden = Garden.fromWallets({
        environment: Environment.TESTNET,
        digestKey: DigestKey.generateRandom().val,
        wallets: {
          evm: walletClient,
        },
      });

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

    this.garden.on("success", async (order, action, txHash) => {
      logger.info(
        `Garden success [${action}] for order: ${JSON.stringify(
          order
        )}, txHash: ${txHash}`
      );

      if (action === "Redeem") {
        const message = `✅ *Swap Completed Successfully!*\n\n` +
          `• Order ID: \`${order.create_order.create_id}\`\n` +
          `• From: ${this.formatChainName(order.create_order.source_chain)}\n` +
          `• To: ${this.formatChainName(order.create_order.destination_chain)}\n` +
          `• Amount: ${order.create_order.destination_amount}\n` +
          `• Transaction: [View Transaction](https://sepolia.etherscan.io/tx/${txHash})`;

        try {
          const userId = this.findUserIdForOrder(order.create_order.create_id);
          if (userId) {
            await this.bot.api.sendMessage(userId, message, {
              parse_mode: "Markdown",
            });
            logger.info(`Sent swap completion notification to user ${userId}`);
          } else {
            logger.warn(`Could not find user ID for order ${order.create_order.create_id}`);
          }
        } catch (error) {
          logger.error(`Error sending swap completion notification: ${error}`);
        }

        return message;
      }
    });
  }

  private formatChainName(chainId: string): string {
    return chainId
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  private findUserIdForOrder(orderId: string): number | undefined {
    return this.orderUserMap?.get(orderId);
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
        throw new Error(quoteResult.error);
      }

      return quoteResult.val;
    } catch (error) {
      logger.error("Error getting quote:", error);
      throw error;
    }
  }

  async executeSwap(swapParams: SwapParams, userId?: number) {
    try {
      const swapResult = await this.garden.swap(swapParams);

      if (!swapResult.ok) {
        throw new Error(`Failed to create swap: ${swapResult.error}`);
      }

      const order = swapResult.val;
      logger.info(
        `Order created successfully, id: ${order.create_order.create_id}`
      );

      // Store the user ID for this order if both values are defined
      if (userId && order.create_order.create_id) {
        this.storeOrderUser(order.create_order.create_id, userId);
      }

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

  public storeOrderUser(orderId: string | undefined, userId: number | undefined) {
    if (!orderId || !userId) {
      logger.warn("Cannot store order-user mapping: missing orderId or userId");
      return;
    }
    
    if (!this.orderUserMap) {
      this.orderUserMap = new Map<string, number>();
    }
    this.orderUserMap.set(orderId, userId);
    logger.info(`Stored user ${userId} for order ${orderId}`);
  }
}

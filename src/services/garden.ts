import { Garden, SecretManager, SwapParams } from "@gardenfi/core";
import { Asset } from "@gardenfi/orderbook";
import { logger } from "../utils/logger";
import { BotContext, WalletData } from "../types";
import { DigestKey, Environment } from "@gardenfi/utils";
import { Bot } from "grammy";

export class GardenService {
  private garden: Garden;
  private bot: Bot<BotContext>;
  private orderUserMap: Map<string, number>;

  constructor(bot: Bot<BotContext>) {
    this.bot = bot;
    this.orderUserMap = new Map<string, number>();
  }

  initializeGarden(ethWallet: WalletData, starknetWallet:WalletData) {
    try {
      this.garden = Garden.fromWallets({
        environment: Environment.TESTNET,
        digestKey: DigestKey.generateRandom().val,
        wallets: {
          evm: ethWallet.client,
          starknet: starknetWallet.client
        },
      });

      this.setupEventListeners();
      return this.garden;
    } catch (error) {
      logger.error("Error initializing garden:", error);
      throw error;
    }
  }

  createGardenWithNetwork(ethereumWalletClient: any,starknetWalletClient: any) {
    try {
      logger.info(
        `Creating new Garden instance for wallet: ${ethereumWalletClient || "default"} and starknet: ${starknetWalletClient || "default"}`
      );

      this.garden = Garden.fromWallets({
        environment: Environment.TESTNET,
        digestKey: DigestKey.generateRandom().val,
        wallets: {
          evm: ethereumWalletClient,
          starknet: starknetWalletClient
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
        const message =
          `✅ *Swap Completed Successfully!*\n\n` +
          `• Order ID: \`${order.create_order.create_id}\`\n` +
          `• From: ${this.formatChainName(order.create_order.source_chain)}\n` +
          `• To: ${this.formatChainName(
            order.create_order.destination_chain
          )}\n` +
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
            logger.warn(
              `Could not find user ID for order ${order.create_order.create_id}`
            );
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
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
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

      // Determine source and destination chains
      const sourceChain = swapParams.fromAsset.name;
      const destinationChain = swapParams.toAsset.name;
      
      // Define the swap type
      const swapType = this.determineSwapType(sourceChain, destinationChain);
      
      // Handle different swap types
      switch (swapType) {
        case 'BTC_TO_EVM':
          // For Bitcoin to any chain swaps, return the deposit address
          const depositAddress = order.source_swap.swap_id;
          logger.info(`Bitcoin deposit address: ${depositAddress}`);
          
          return {
            order,
            depositAddress,
            isBitcoinSource: true,
          };
          
        case 'EVM_TO_BTC':
          // Use the EVM relay service for gasless initiates
          // The relay handles transaction execution on behalf of the user
          const evmToBtcRes = await this.garden.evmHTLC.initiate(order);
          
          if (evmToBtcRes.error) {
            console.log(`Error encountered for account: ${ethereumWalletClient.account.address}`);
            throw new Error(evmToBtcRes.error);
          }
          
          logger.info(`EVM to BTC swap initiated, txHash: ${evmToBtcRes.val}`);
          this.garden.execute().catch((error) => {
            logger.error("Error during execution:", error);
          });
          
          return {
            order,
            txHash: evmToBtcRes.val,
            isBitcoinSource: false,
            isStarknetSource: false,
          };
          
        case 'STARKNET_TO_BTC':
          // Use the Starknet relay service for gasless initiates
          // The relay handles transaction execution on behalf of the user
          const starknetToBtcRes = await this.garden.starknetHTLC.initiate(order);
          
          if (starknetToBtcRes.error) {
            console.log(`Error encountered for account: ${starknetWallet.address}`);
            throw new Error(starknetToBtcRes.error);
          }
          
          logger.info(`Starknet to BTC swap initiated, txHash: ${starknetToBtcRes.val}`);
          this.garden.execute().catch((error) => {
            logger.error("Error during execution:", error);
          });
          
          return {
            order,
            txHash: starknetToBtcRes.val,
            isBitcoinSource: false,
            isStarknetSource: true,
          };
          
        case 'EVM_TO_STARKNET':
          // Use the EVM relay service for gasless initiates
          // The relay handles transaction execution on behalf of the user
          const evmToStarknetRes = await this.garden.evmHTLC.initiate(order);
          
          if (evmToStarknetRes.error) {
            console.log(`Error encountered for account: ${ethereumWalletClient.account.address}`);
            throw new Error(evmToStarknetRes.error);
          }
          
          logger.info(`EVM to Starknet swap initiated, txHash: ${evmToStarknetRes.val}`);
          this.garden.execute().catch((error) => {
            logger.error("Error during execution:", error);
          });
          
          return {
            order,
            txHash: evmToStarknetRes.val,
            isBitcoinSource: false,
            isStarknetSource: false,
          };
          
        case 'STARKNET_TO_EVM':
          // Use the Starknet relay service for gasless initiates
          // The relay handles transaction execution on behalf of the user
          const starknetToEvmRes = await this.garden.starknetHTLC.initiate(order);
          
          if (starknetToEvmRes.error) {
            console.log(`Error encountered for account: ${starknetWallet.address}`);
            throw new Error(starknetToEvmRes.error);
          }
          
          logger.info(`Starknet to EVM swap initiated, txHash: ${starknetToEvmRes.val}`);
          this.garden.execute().catch((error) => {
            logger.error("Error during execution:", error);
          });
          
          return {
            order,
            txHash: starknetToEvmRes.val,
            isBitcoinSource: false,
            isStarknetSource: true,
          };
          
        default:
          throw new Error(`Unsupported swap type: ${sourceChain} to ${destinationChain}`);
      }
    } catch (error) {
      logger.error("Error executing swap:", error);
      throw error;
    }
  }
  
  // Helper method to determine the swap type
  private determineSwapType(sourceChain: string, destinationChain: string): string {
    if (sourceChain.includes("bitcoin")) {
      return "BTC_TO_EVM"; // Assuming all non-BTC destinations are EVM-compatible
    } else if (destinationChain.includes("bitcoin")) {
      if (sourceChain.includes("starknet")) {
        return "STARKNET_TO_BTC";
      } else {
        return "EVM_TO_BTC";
      }
    } else if (sourceChain.includes("starknet")) {
      return "STARKNET_TO_EVM";
    } else if (destinationChain.includes("starknet")) {
      return "EVM_TO_STARKNET";
    }
    
    // Default case for EVM to EVM swaps
    return "EVM_TO_EVM";
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

  public storeOrderUser(
    orderId: string | undefined,
    userId: number | undefined
  ) {
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

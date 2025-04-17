import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { GardenService } from "../services/garden";
import { Chain, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { with0x } from "@gardenfi/utils";
import { Chains, SupportedAssets } from "@gardenfi/orderbook";
import { logger } from "../utils/logger";
import { SwapParams } from "@gardenfi/core";

export function swapCommand(
  bot: Bot<BotContext>,
  gardenService: GardenService
): void {
  // Swap command - initiates swap flow
  bot.command("swap", async (ctx) => {
    await handleSwapMenu(ctx, gardenService);
  });

  // Handle swap menu callback
  bot.callbackQuery("swap_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleSwapMenu(ctx, gardenService);
  });

  // Handle network selection
  bot.callbackQuery(/^network_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    // Extract network ID from callback data
    const networkId = ctx.match[1];

    const availableNetworks = Object.entries(Chains);
    const selectedNetworkEntry = availableNetworks.find(
      ([key]) => key === networkId
    );

    if (!selectedNetworkEntry) {
      await ctx.reply("Invalid network selected. Please try again.");
      await handleSwapMenu(ctx, gardenService);
      return;
    }

    const [networkKey, selectedNetwork] = selectedNetworkEntry;
    logger.info(`Selected Network: ${networkKey}`);

    // Format network name for display (convert SEPOLIA_ETHEREUM to Sepolia Ethereum)
    const networkName = networkKey
      .split("_")
      .map(
        (word: string) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join(" ");

    // Store the selected network in session
    ctx.session.swapParams = {
      ...ctx.session.swapParams,
      selectedNetwork: selectedNetwork as unknown as Chain,
      networkKey: networkKey,
    };

    // Update session step
    ctx.session.step = "select_from_asset";

    try {
      // Get supported assets from SupportedAssets.testnet
      const supportedAssets = Object.entries(SupportedAssets.testnet);

      // Filter unique chain types to use as asset options
      const uniqueChainAssets = new Map();

      // Group by chain and take the first asset of each chain
      supportedAssets.forEach(([key, asset]) => {
        if (!uniqueChainAssets.has(asset.chain)) {
          uniqueChainAssets.set(asset.chain, {
            key,
            chain: asset.chain,
            atomicSwapAddress: asset.atomicSwapAddress,
          });
        }
      });

      // Convert Map to array for display
      const assetOptions = Array.from(uniqueChainAssets.values());

      // Create keyboard with supported assets
      const keyboard = new InlineKeyboard();

      // Add asset buttons to keyboard
      assetOptions.forEach((asset) => {
        // Format chain name for display (e.g., "ethereum_sepolia" to "Ethereum Sepolia")
        const chainName = asset.chain
          .split("_")
          .map(
            (word: string) =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          )
          .join(" ");

        keyboard.text(chainName, `from_asset_${asset.chain}`);
        keyboard.row();
      });

      keyboard.text("🔙 Back to Networks", "swap_menu");

      await ctx.reply(
        `Selected Network: ${networkName}\n\n` +
          "💱 Select the asset you want to swap from:",
        {
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      logger.error("Error loading assets:", error);
      await ctx.reply(
        "❌ Error loading assets.\n\n" + "Please try again later."
      );
    }
  });

  // Handle "from asset" selection
  bot.callbackQuery(/^from_asset_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    // Extract selected asset chain from callback data
    const fromAssetChain = ctx.match[1];
    logger.info(`Selected fromAsset chain: ${fromAssetChain}`);

    // Find the asset in SupportedAssets
    const supportedAssets = Object.entries(SupportedAssets.testnet);
    const fromAssetEntry = supportedAssets.find(
      ([_, asset]) => asset.chain === fromAssetChain
    );

    if (!fromAssetEntry) {
      await ctx.reply("Invalid asset selected. Please try again.");
      await handleSwapMenu(ctx, gardenService);
      return;
    }

    const [fromAssetKey, fromAsset] = fromAssetEntry;

    // Store from asset in session
    ctx.session.swapParams = {
      ...ctx.session.swapParams,
      fromAsset,
    };

    // Update session step
    ctx.session.step = "select_to_asset";

    try {
      // Get supported assets for destination (excluding the from_asset chain)
      const supportedAssets = Object.entries(SupportedAssets.testnet);

      // Group assets by chain (excluding the fromAsset chain)
      const uniqueChainAssets = new Map();
      supportedAssets.forEach(([key, asset]) => {
        if (
          asset.chain !== fromAssetChain &&
          !uniqueChainAssets.has(asset.chain)
        ) {
          uniqueChainAssets.set(asset.chain, {
            key,
            chain: asset.chain,
            atomicSwapAddress: asset.atomicSwapAddress,
          });
        }
      });

      // Convert Map to array for display
      const assetOptions = Array.from(uniqueChainAssets.values());

      // Format the fromAsset chain name for display
      const fromChainName = fromAssetChain
        .split("_")
        .map(
          (word: string) =>
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join(" ");

      // Create keyboard with supported assets
      const keyboard = new InlineKeyboard();

      // Add asset buttons to keyboard
      assetOptions.forEach((asset) => {
        // Format chain name for display (e.g., "ethereum_sepolia" to "Ethereum Sepolia")
        const chainName = asset.chain
          .split("_")
          .map(
            (word: string) =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          )
          .join(" ");

        keyboard.text(chainName, `to_asset_${asset.chain}`);
        keyboard.row();
      });

      keyboard.text("🔙 Back to From Asset", "swap_menu");

      await ctx.reply(
        `From: ${fromChainName}\n\n` +
          "💱 Select the asset you want to swap to:",
        {
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      logger.error("Error loading destination assets:", error);
      await ctx.reply(
        "❌ Error loading destination assets.\n\n" + "Please try again later."
      );
    }
  });

  // Handle "to asset" selection
  bot.callbackQuery(/^to_asset_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    // Extract selected asset chain from callback data
    const toAssetChain = ctx.match[1];
    logger.info(`Selected toAsset chain: ${toAssetChain}`);

    // Find the asset in SupportedAssets
    const supportedAssets = Object.entries(SupportedAssets.testnet);
    const toAssetEntry = supportedAssets.find(
      ([_, asset]) => asset.chain === toAssetChain
    );

    if (!toAssetEntry) {
      await ctx.reply("Invalid asset selected. Please try again.");
      return;
    }

    const [toAssetKey, toAsset] = toAssetEntry;

    // Store to asset in session
    ctx.session.swapParams = {
      ...ctx.session.swapParams,
      toAsset,
    };

    // Update session step
    ctx.session.step = "swap_amount";

    // Format the fromAsset and toAsset chain names for display
    const fromChainName = ctx.session.swapParams?.fromAsset?.chain
      .split("_")
      .map(
        (word: string) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join(" ");

    const toChainName = toAssetChain
      .split("_")
      .map(
        (word: string) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join(" ");

    const cancelKeyboard = new InlineKeyboard().text("❌ Cancel", "swap_menu");

    await ctx.reply(
      `From: ${fromChainName}\nTo: ${toChainName}\n\n` +
        "💲 Enter the amount you want to swap (e.g., 0.1):",
      {
        reply_markup: cancelKeyboard,
      }
    );
  });

  // Handle swap confirmation
  bot.callbackQuery("confirm_swap", async (ctx) => {
    await ctx.answerCallbackQuery();

    try {
      if (
        !ctx.session.swapParams ||
        !ctx.session.swapParams.fromAsset ||
        !ctx.session.swapParams.toAsset ||
        !ctx.session.swapParams.sendAmount ||
        !ctx.session.swapParams.destinationAddress ||
        !ctx.session.swapParams.selectedNetwork ||
        !ctx.session.swapParams.networkKey
      ) {
        await ctx.reply("Missing swap information. Please start over.");
        await handleSwapMenu(ctx, gardenService);
        return;
      }

      await ctx.reply("🔄 Processing your swap request...");

      // Get active wallet from session
      const activeWalletAddress = ctx.session.activeWallet;
      if (!activeWalletAddress || !ctx.session.wallets[activeWalletAddress]) {
        await ctx.reply(
          "❌ No active wallet found. Please create or import a wallet first."
        );
        return;
      }

      const activeWallet = ctx.session.wallets[activeWalletAddress];

      // Check if wallet has private key
      if (!activeWallet.privateKey) {
        await ctx.reply(
          "❌ Wallet private key not found. Please create a new wallet."
        );
        return;
      }

      // Create wallet client with the selected network
      const network = ctx.session.swapParams.selectedNetwork;

      if (!network) {
        await ctx.reply("❌ Selected network information is missing.");
        return;
      }

      try {
        // Set up the wallet client with the correct network
        const walletClient = createWalletClient({
          account: privateKeyToAccount(with0x(activeWallet.privateKey)),
          chain: network,
          transport: http(),
        });

        logger.info("Created wallet client for network:", network);
        logger.info("Creating new Garden instance...");

        // Create a new Garden instance with the new wallet client
        try {
          // Update Garden service with the new wallet client
          gardenService.createGardenWithNetwork(walletClient);
        } catch (error) {
          logger.error("Error updating wallet client:", error);
          await ctx.reply("❌ Error updating wallet for selected network.");
          return;
        }

        // Wait a moment to ensure the Garden instance is ready
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Get a quote first
        await ctx.reply("💱 Getting quote for your swap...");

        try {
          const fromAsset = ctx.session.swapParams.fromAsset;
          const toAsset = ctx.session.swapParams.toAsset;
          const sendAmount = parseInt(ctx.session.swapParams.sendAmount);

          // Get quote
          const quote = await gardenService.getQuote(
            fromAsset,
            toAsset,
            sendAmount
          );

          // Choose the first strategy
          const [strategyId, receiveAmount] = Object.entries(quote.quotes)[0];

          await ctx.reply(
            `Quote received:\n` +
              `You will send: ${sendAmount} ${fromAsset.chain
                .split("_")
                .pop()}\n` +
              `You will receive: ${receiveAmount} ${toAsset.chain
                .split("_")
                .pop()}\n` +
              `Strategy: ${strategyId}`
          );

          // Build swap parameters according to documentation
          const swapParams: SwapParams = {
            fromAsset: ctx.session.swapParams.fromAsset,
            toAsset: ctx.session.swapParams.toAsset,
            sendAmount: ctx.session.swapParams.sendAmount,
            receiveAmount: receiveAmount.toString(), // From the quote
            nonce: Date.now(),
            additionalData: {
              strategyId: strategyId,
              // Add btcAddress if needed for BTC swaps
              ...(ctx.session.swapParams.toAsset.chain.includes("bitcoin")
                ? {
                    btcAddress: ctx.session.swapParams.destinationAddress,
                  }
                : {}),
            },
          };

          // Execute the swap
          await ctx.reply("🚀 Executing swap... This might take a moment.");

          try {
            // Call the executeSwap method with proper SwapParams
            const result = await gardenService.executeSwap(swapParams);

            // Report success
            await ctx.reply(
              "✅ Swap initiated successfully!\n\n" +
                `Order ID: ${result.order.create_order.create_id}\n` +
                `Transaction Hash: ${result.txHash}\n\n` +
                "Your transaction has been submitted to the network. " +
                "It may take a few minutes to complete.\n\n" +
                "The bot is monitoring your swap and will handle redemption automatically."
            );

            // Clear swap params from session
            ctx.session.swapParams = {};
            ctx.session.step = "initial";
          } catch (swapError: unknown) {
            const errorMessage =
              swapError instanceof Error ? swapError.message : "Unknown error";

            logger.error("Error executing swap:", swapError);
            await ctx.reply(
              "❌ Error executing swap: " +
                errorMessage +
                "\n\nPlease try again later."
            );
          }
        } catch (quoteError: unknown) {
          const errorMessage =
            quoteError instanceof Error ? quoteError.message : "Unknown error";

          logger.error("Error getting quote:", quoteError);
          await ctx.reply(
            "❌ Error getting quote: " +
              errorMessage +
              "\n\nPlease try again later."
          );
        }
      } catch (httpError: unknown) {
        const errorMessage =
          httpError instanceof Error ? httpError.message : "Unknown error";

        logger.error("Error creating wallet client:", httpError);
        await ctx.reply(
          "❌ Error setting up network connection: " + errorMessage
        );
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      logger.error("Error in swap confirmation:", error);
      await ctx.reply(
        "❌ Error processing swap: " +
          errorMessage +
          "\n\nPlease try again later."
      );
    }
  });
}

// Helper function to handle swap menu
async function handleSwapMenu(ctx: BotContext, gardenService: GardenService) {
  const hasWallets = Object.keys(ctx.session.wallets || {}).length > 0;

  if (!hasWallets) {
    const keyboard = new InlineKeyboard()
      .text("🔑 Create Wallet", "wallet_menu")
      .text("🔙 Back to Main Menu", "main_menu");

    await ctx.reply(
      "❌ You need to create or import a wallet before swapping.\n\n" +
        "Please create or import a wallet first:",
      {
        reply_markup: keyboard,
      }
    );
    return;
  }

  // If user has wallets, show network selection
  ctx.session.step = "select_network";

  // Get available networks dynamically
  const availableNetworks = Object.entries(Chains);

  // Create keyboard with all available networks
  const networkKeyboard = new InlineKeyboard();

  availableNetworks.forEach(([key, chain], index) => {
    // Format network name for display (convert SEPOLIA_ETHEREUM to Sepolia Ethereum)
    const networkName = key
      .split("_")
      .map(
        (word: string) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join(" ");

    networkKeyboard.text(networkName, `network_${key}`);

    // Add row break every 2 networks (or customize as needed)
    if (index % 2 === 1) {
      networkKeyboard.row();
    }
  });

  // Add back button at the end
  networkKeyboard.row().text("🔙 Back to Main Menu", "main_menu");

  await ctx.reply(
    "🌐 Select a network for your swap:\n\n" +
      "This will determine which blockchain the swap will be initiated from.",
    {
      reply_markup: networkKeyboard,
    }
  );
}

import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { GardenService } from "../services/garden";
import { Chain, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { with0x, } from "@gardenfi/utils";
import { Chains, SupportedAssets } from "@gardenfi/orderbook";
import { logger } from "../utils/logger";
import { SwapParams } from "@gardenfi/core";
import { SupportedChainId, supportedChains } from "../utils/chains";

export function swapCommand(
  bot: Bot<BotContext>,
  gardenService: GardenService
): void {
  bot.command("swap", async (ctx) => {
    await handleSwapMenu(ctx, gardenService);
  });

  bot.callbackQuery("swap_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleSwapMenu(ctx, gardenService);
  });
  bot.callbackQuery(/^network_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    const networkId = ctx.match[1] as SupportedChainId;
    const selectedNetwork = supportedChains[networkId];

    if (!selectedNetwork) {
      await ctx.reply("Invalid network selected. Please try again.");
      await handleSwapMenu(ctx, gardenService);
      return;
    }

    logger.info(`Selected Network: ${networkId}`);

    const networkName = networkId
      .split("_")
      .map(
        (word: string) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join(" ");

    ctx.session.swapParams = {
      ...ctx.session.swapParams,
      selectedNetwork: selectedNetwork,
      networkKey: networkId,
    };

    ctx.session.step = "select_from_asset";

    try {
      const supportedAssets = Object.entries(SupportedAssets.testnet);

      const uniqueChainAssets = new Map();

      supportedAssets.forEach(([key, asset]) => {
        if (!uniqueChainAssets.has(asset.chain)) {
          uniqueChainAssets.set(asset.chain, {
            key,
            chain: asset.chain,
            atomicSwapAddress: asset.atomicSwapAddress,
          });
        }
      });

      const assetOptions = Array.from(uniqueChainAssets.values());

      const keyboard = new InlineKeyboard();

      assetOptions.forEach((asset) => {
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

  bot.callbackQuery(/^from_asset_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    const fromAssetChain = ctx.match[1];
    logger.info(`Selected fromAsset chain: ${fromAssetChain}`);

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

    ctx.session.swapParams = {
      ...ctx.session.swapParams,
      fromAsset,
    };

    ctx.session.step = "select_to_asset";

    try {
      const supportedAssets = Object.entries(SupportedAssets.testnet);

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

      const assetOptions = Array.from(uniqueChainAssets.values());

      const fromChainName = fromAssetChain
        .split("_")
        .map(
          (word: string) =>
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join(" ");

      const keyboard = new InlineKeyboard();

      assetOptions.forEach((asset) => {
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

  bot.callbackQuery(/^to_asset_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    const toAssetChain = ctx.match[1];
    logger.info(`Selected toAsset chain: ${toAssetChain}`);

    const supportedAssets = Object.entries(SupportedAssets.testnet);
    const toAssetEntry = supportedAssets.find(
      ([_, asset]) => asset.chain === toAssetChain
    );

    if (!toAssetEntry) {
      await ctx.reply("Invalid asset selected. Please try again.");
      return;
    }

    const [toAssetKey, toAsset] = toAssetEntry;

    ctx.session.swapParams = {
      ...ctx.session.swapParams,
      toAsset,
    };

    ctx.session.step = "swap_amount";

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

  bot.callbackQuery("confirm_swap", async (ctx) => {
    await ctx.answerCallbackQuery();

    if (!ctx.session.swapParams?.fromAsset || !ctx.session.swapParams?.toAsset) {
      await ctx.reply("❌ Swap information is missing. Please start over.");
      return;
    }

    try {
      await ctx.reply("⏳ *Processing your swap...*", {
        parse_mode: "Markdown",
      });

      const activeWalletAddress = ctx.session.activeWallet;
      if (!activeWalletAddress || !ctx.session.wallets[activeWalletAddress]) {
        await ctx.reply("❌ No active wallet found. Please create or import a wallet first.");
        return;
      }

      const activeWallet = ctx.session.wallets[activeWalletAddress];

      if (!activeWallet.privateKey) {
        await ctx.reply(
          "❌ Wallet private key not found. Please create a new wallet."
        );
        return;
      }

      const network = ctx.session.swapParams.selectedNetwork;

      if (!network) {
        await ctx.reply("❌ Selected network information is missing.");
        return;
      }

      try {
        const walletClient = createWalletClient({
          account: privateKeyToAccount(with0x(activeWallet.privateKey)),
          chain: network,
          transport: http(),
        });

        logger.info("Created wallet client for network:", network);
        logger.info("Creating new Garden instance...");

        try {
          gardenService.createGardenWithNetwork(walletClient);
        } catch (error) {
          logger.error("Error updating wallet client:", error);
          await ctx.reply("❌ Error updating wallet for selected network.");
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));

        await ctx.reply("💱 Getting quote for your swap...");

        try {
          const fromAsset = ctx.session.swapParams.fromAsset;
          const toAsset = ctx.session.swapParams.toAsset;
          const sendAmount = ctx.session.swapParams.sendAmount;

          if (!fromAsset || !toAsset || !sendAmount) {
            await ctx.reply("❌ Missing swap parameters. Please start over.");
            return;
          }

          const sendAmountNum = parseInt(sendAmount);
          if (isNaN(sendAmountNum) || sendAmountNum <= 0) {
            await ctx.reply(
              "❌ Invalid amount. Please enter a positive number."
            );
            return;
          }

          const quote = await gardenService.getQuote(
            fromAsset,
            toAsset,
            sendAmountNum
          );

          const [strategyId, receiveAmount] = Object.entries(quote.quotes)[0];

          await ctx.reply(
            `Quote received:\n` +
            `You will send: ${sendAmountNum} ${fromAsset.chain
              .split("_")
              .pop()}\n` +
            `You will receive: ${receiveAmount} ${toAsset.chain
              .split("_")
              .pop()}\n` +
            `Strategy: ${strategyId}`
          );

          // First determine if we need a Bitcoin wallet
          const isFromBitcoin = fromAsset.chain.includes('bitcoin');
          const isToBitcoin = toAsset.chain.includes('bitcoin');

          // Find the Bitcoin wallet address if needed for the swap
          let btcWalletAddress: string | undefined = "";
          if (isFromBitcoin || isToBitcoin) {
            btcWalletAddress = Object.keys(ctx.session.wallets).find(
              addr => ctx.session.wallets[addr].chain === "bitcoin"
            );

            if (btcWalletAddress) {
              logger.info(`Found Bitcoin wallet address: ${btcWalletAddress}`);
            } else {
              logger.warn("No Bitcoin wallet found for swap");
            }
          }

          const swapParams: SwapParams = {
            fromAsset: fromAsset,
            toAsset: toAsset,
            sendAmount: sendAmount,
            receiveAmount: receiveAmount.toString(),
            nonce: Date.now(),
            additionalData: {
              strategyId: strategyId,
              ...(isFromBitcoin
                ? {
                  // For Bitcoin to EVM, use the Bitcoin wallet address
                  btcAddress: btcWalletAddress
                }
                : isToBitcoin
                  ? {
                    // For EVM to Bitcoin, use the destination address
                    btcAddress: ctx.session.swapParams.destinationAddress
                  }
                  : {}),
            },
          };

          // Get the Bitcoin wallet if needed for a Bitcoin source swap
          let btcWallet;
          if (isFromBitcoin) {
            // We already found the Bitcoin wallet address above
            if (!btcWalletAddress) {
              await ctx.reply("❌ Bitcoin wallet not found. Please create or import a wallet first.");
              return;
            }

            btcWallet = ctx.session.wallets[btcWalletAddress].client;

            if (!btcWallet) {
              await ctx.reply("❌ Bitcoin wallet client not found. Please recreate your wallet.");
              return;
            }

          }

          logger.info(`Found Bitcoin wallet with address: ${btcWalletAddress}`);
          await ctx.reply("🚀 Executing swap... This might take a moment.");

          try {
            // Make sure ctx.from.id is defined
            const userId = ctx.from?.id;
            const swapResult = await gardenService.executeSwap(
              swapParams,
              userId
            );

            if (swapResult.isBitcoinSource) {
              // Handle Bitcoin to EVM swap
              if (isFromBitcoin && btcWallet) {
                // Initiate the Bitcoin transaction
                await ctx.reply("🔄 Initiating Bitcoin transaction...");

                try {
                  const txHash = await btcWallet.send(
                    swapResult.depositAddress,
                    Number(sendAmount)
                  );

                  await ctx.reply(
                    "✅ *Swap Initiated Successfully!*\n\n" +
                    `Bitcoin Transaction: \`${txHash}\`\n\n` +
                    `Deposit Address: \`${swapResult.depositAddress}\`\n\n` +
                    "Your Bitcoin transaction has been submitted to the network. " +
                    "It may take a few minutes to confirm.\n\n" +
                    "The bot is monitoring your swap and will handle redemption automatically.",
                    {
                      parse_mode: "Markdown",
                    }
                  );
                } catch (btcError) {
                  logger.error("Error sending Bitcoin transaction:", btcError);

                  // Just show the error message without the instructions
                  const errorMessage = btcError instanceof Error ? btcError.message : String(btcError);

                  await ctx.reply(
                    "⚠️ *Bitcoin Transaction Failed*\n\n" +
                    `Error: ${errorMessage}\n\n` +
                    `Deposit Address: \`${swapResult.depositAddress}\``,
                    {
                      parse_mode: "Markdown",
                    }
                  );
                }
              } else {
                // Just show the deposit address if we couldn't find the Bitcoin wallet
                await ctx.reply(
                  "✅ *Swap Order Created Successfully!*\n\n" +
                  `Deposit Address: \`${swapResult.depositAddress}\`\n\n` +
                  "Your Bitcoin transaction has been submitted to the network. " +
                  "The bot is monitoring for your deposit and will handle the swap automatically once confirmed.",
                  {
                    parse_mode: "Markdown",
                  }
                );
              }
            } else {
              // Handle EVM to EVM or EVM to Bitcoin swap - keep your existing code
              await ctx.reply(
                "✅ Swap initiated successfully!\n\n" +
                `Order ID: ${swapResult.order.create_order.create_id}\n` +
                `Transaction Hash: ${swapResult.txHash}\n\n` +
                "Your transaction has been submitted to the network. " +
                "It may take a few minutes to complete.\n\n" +
                "The bot is monitoring your swap and will handle redemption automatically."
              );
            }

            // Execute the swap (handle redemption)
            gardenService.execute().catch(error => {
              logger.error("Error during execution:", error);
            });

            ctx.session.swapParams = {};
            ctx.session.step = "initial";
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";

            logger.error("Error executing swap:", error);
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

  ctx.session.step = "select_network";

  const availableNetworks = Object.entries(supportedChains);
  const networkKeyboard = new InlineKeyboard();

  availableNetworks.forEach(([key, chain], index) => {
    const networkName = key
      .split("_")
      .map(
        (word: string) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join(" ");

    networkKeyboard.text(networkName, `network_${key}`);

    if (index % 2 === 1) {
      networkKeyboard.row();
    }
  });

  networkKeyboard.row().text("🔙 Back to Main Menu", "main_menu");

  await ctx.reply(
    "🌐 Select a network for your swap:\n\n" +
    "This will determine which blockchain the swap will be initiated from.",
    {
      reply_markup: networkKeyboard,
    }
  );
}

import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { GardenService } from "../services/garden";
import { WalletService } from "../services/wallet";
import { Chain } from "viem";
import { arbitrumSepolia, sepolia } from "viem/chains";
import { logger } from "../utils/logger";

export function handleTextMessages(
  bot: Bot<BotContext>,
  gardenService: GardenService
): void {
  bot.on("message:text", async (ctx) => {
    logger.info(
      `Received text message. Current step: ${ctx.session.step}, Text: ${ctx.message.text}`
    );

    switch (ctx.session.step) {
      case "wallet_import":
        await handleWalletImport(ctx);
        break;
      case "swap_amount":
        await handleSwapAmount(ctx);
        break;
      case "enter_destination":
        await handleDestinationAddress(ctx);
        break;
      default:
        logger.info(`Unhandled text message in step: ${ctx.session.step}`);
    }
  });
}

async function handleWalletImport(ctx: BotContext) {
  if (!ctx.message?.text) {
    logger.error("Message or text is undefined");
    await ctx.reply("Invalid message format");
    return;
  }
  const text = ctx.message.text.trim();
  logger.info(
    `Processing wallet import with text (first 10 chars): ${text.substring(
      0,
      10
    )}...`
  );

  if (!ctx.session.tempData?.importType) {
    logger.error("Import type not found in tempData");
    await ctx.reply("Please start the import process again.");
    return;
  }

  const isPrivateKey = ctx.session.tempData.importType === "private_key";
  logger.info(
    `Attempting to import via: ${isPrivateKey ? "private key" : "mnemonic"}`
  );

  try {
    let walletResponse;

    if (isPrivateKey) {
      const privateKey = text.startsWith("0x") ? text : `0x${text}`;
      logger.info("Importing from private key");
      walletResponse = await WalletService.importFromPrivateKey(
        privateKey,
        arbitrumSepolia as Chain
      );
    } else {
      logger.info("Importing from mnemonic");
      walletResponse = await WalletService.importFromMnemonic(
        text,
        arbitrumSepolia as Chain
      );
    }

    logger.info(`Import successful: ${!!walletResponse}`);

    if (!ctx.session.wallets) ctx.session.wallets = {};

    ctx.session.wallets[walletResponse.ethWalletData.address] =
      walletResponse.ethWalletData;

    ctx.session.wallets[walletResponse.btcWalletData.address] =
      walletResponse.btcWalletData;

    ctx.session.activeWallet = walletResponse.ethWalletData.address;

    ctx.session.tempData = {};
    ctx.session.step = "wallet_imported";

    const keyboard = new InlineKeyboard()
      .text("💱 Start Swapping", "swap_menu")
      .text("👛 View Wallets", "list_wallets")
      .row()
      .text("🔙 Main Menu", "main_menu");

    await ctx.reply(
      `✅ Wallets imported successfully!\n\n` +
        `Ethereum Address: ${walletResponse.ethWalletData.address}\n` +
        `Bitcoin Address: ${walletResponse.btcWalletData.address}\n\n` +
        "What would you like to do next?",
      {
        reply_markup: keyboard,
      }
    );
  } catch (error) {
    logger.error("Error importing wallets:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await ctx.reply(
      `❌ Error importing wallets: ${errorMessage}\n\n` +
        "Please check your input and try again.",
      {
        reply_markup: new InlineKeyboard().text("🔙 Back", "wallet_menu"),
      }
    );
  }
}

async function handleSwapAmount(ctx: BotContext) {
  logger.info("Processing swap amount input");

  try {
    if (!ctx.session.swapParams) {
      logger.error("Swap params missing in session");
      await ctx.reply(
        "Something went wrong. Please start the swap process again."
      );
      return;
    }

    if (!ctx.message?.text) {
      logger.error("Message or text is undefined");
      await ctx.reply("Please enter a valid amount.");
      return;
    }

    const amount = parseFloat(ctx.message.text);

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply("Please enter a valid positive number for the amount.");
      return;
    }

    logger.info(`Valid amount entered: ${amount}`);

    ctx.session.swapParams = {
      ...ctx.session.swapParams,
      sendAmount: amount.toString(),
    };

    ctx.session.step = "enter_destination";

    logger.info(
      `Amount ${amount} stored in session, moving to destination address step`
    );

    await ctx.reply(
      "🔑 Enter the destination address to receive the swapped tokens:",
      {
        reply_markup: new InlineKeyboard().text("❌ Cancel", "swap_menu"),
      }
    );
  } catch (error) {
    logger.error("Error processing swap amount:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await ctx.reply(
      `❌ Error processing amount: ${errorMessage}\n\n` +
        "Please try again or start over.",
      {
        reply_markup: new InlineKeyboard().text("🔙 Back", "swap_menu"),
      }
    );
  }
}

async function handleDestinationAddress(ctx: BotContext) {
  logger.info("Processing destination address");

  try {
    if (!ctx.session.swapParams) {
      logger.error("Swap params missing in session");
      await ctx.reply(
        "Something went wrong. Please start the swap process again."
      );
      return;
    }

    if (!ctx.message?.text) {
      logger.error("Message or text is undefined");
      await ctx.reply("Invalid message format");
      return;
    }

    const destinationAddress = ctx.message.text.trim();

    if (destinationAddress.length < 30) {
      await ctx.reply("Please enter a valid address.");
      return;
    }

    ctx.session.swapParams = {
      ...ctx.session.swapParams,
      destinationAddress,
    };

    ctx.session.step = "confirm_swap";

    const fromChainName = ctx.session.swapParams?.fromAsset?.chain
      ? ctx.session.swapParams.fromAsset.chain
          .split("_")
          .map(
            (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          )
          .join(" ")
      : "Unknown";

    const toChainName = ctx.session.swapParams?.toAsset?.chain
      ? ctx.session.swapParams.toAsset.chain
          .split("_")
          .map(
            (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          )
          .join(" ")
      : "Unknown";

    const confirmKeyboard = new InlineKeyboard()
      .text("✅ Confirm Swap", "confirm_swap")
      .row()
      .text("❌ Cancel", "swap_menu");

    logger.info(`Destination address set, moving to confirmation step`);

    await ctx.reply(
      "📝 Review your swap details:\n\n" +
        `From: ${fromChainName}\n` +
        `To: ${toChainName}\n` +
        `Amount: ${ctx.session.swapParams.sendAmount}\n` +
        `Destination Address: ${destinationAddress}\n\n` +
        "Please confirm your swap:",
      {
        reply_markup: confirmKeyboard,
      }
    );
  } catch (error) {
    logger.error("Error processing destination address:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await ctx.reply(
      `❌ Error processing address: ${errorMessage}\n\n` +
        "Please try again or start over.",
      {
        reply_markup: new InlineKeyboard().text("🔙 Back", "swap_menu"),
      }
    );
  }
}

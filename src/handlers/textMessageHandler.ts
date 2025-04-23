import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { WalletService } from "../services/wallet";
import { Chain, isAddress } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { logger } from "../utils/logger";
import { StarknetService } from "../services/starknet";

export function handleTextMessages(
  bot: Bot<BotContext>,
  starknetService: StarknetService
): void {
  bot.on("message:text", async (ctx) => {
    logger.info(
      `Received text message. Current step: ${ctx.session.step}, Text: ${ctx.message.text}`
    );

    switch (ctx.session.step) {
      case "wallet_import":
        await handleWalletImport(ctx, starknetService);
        break;
      case "swap_amount":
        await handleSwapAmount(ctx);
        break;
      case "choose_destination_method":
        // This step is handled by callback queries, not text
        await ctx.reply("Please choose an option using the buttons.");
        break;
      case "enter_destination":
        await handleDestinationAddress(ctx);
        return;
      case "starknet_address_input":
        if (!ctx.session.tempData) {
          ctx.session.tempData = {};
        }
        await handleStarknetAddressInput(ctx);
        break;
      default:
        logger.info(`Unhandled text message in step: ${ctx.session.step}`);
    }
  });
}

async function handleWalletImport(
  ctx: BotContext,
  starknetService: StarknetService
) {
  if (!ctx.message?.text) {
    logger.error("Message or text is undefined");
    await ctx.reply("❌ Invalid message format. Please try again.");
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
    await ctx.reply("❌ Please start the import process again.", {
      parse_mode: "Markdown",
    });
    return;
  }

  const isPrivateKey = ctx.session.tempData.importType === "private_key";
  logger.info(
    `Attempting to import via: ${isPrivateKey ? "private key" : "mnemonic"}`
  );

  try {
    await ctx.reply("⏳ *Importing wallets...*", {
      parse_mode: "Markdown",
    });

    let walletResponse;

    if (isPrivateKey) {
      const privateKey = text.startsWith("0x") ? text : `0x${text}`;
      logger.info("Importing from private key");

      // Store the private key in tempData for Starknet
      if (ctx.session.tempData?.importChain === "starknet") {
        ctx.session.tempData.privateKey = privateKey;
      }

      walletResponse = await WalletService.importFromPrivateKey(
        privateKey,
        arbitrumSepolia as Chain,
        starknetService,
        ctx.session.tempData?.starknetAddress,
        ctx.session.tempData?.importChain
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

    // Only add wallets that were actually imported
    if (walletResponse.ethWalletData && walletResponse.ethWalletData.address) {
      ctx.session.wallets[walletResponse.ethWalletData.address] =
        walletResponse.ethWalletData;
      ctx.session.activeWallet = walletResponse.ethWalletData.address;
    }

    if (walletResponse.btcWalletData && walletResponse.btcWalletData.address) {
      ctx.session.wallets[walletResponse.btcWalletData.address] =
        walletResponse.btcWalletData;

      // Set active wallet to BTC if ETH wasn't imported
      if (!walletResponse.ethWalletData) {
        ctx.session.activeWallet = walletResponse.btcWalletData.address;
      }
    }

    // Save Starknet wallet data if it exists
    if (walletResponse.starknetWalletData) {
      ctx.session.wallets[walletResponse.starknetWalletData.address] =
        walletResponse.starknetWalletData;

      // Preserve the Starknet address and private key in session.tempData
      // This ensures they're available for swap operations
      if (!ctx.session.tempData) ctx.session.tempData = {};
      ctx.session.tempData.starknetAddress =
        walletResponse.starknetWalletData.address;
      ctx.session.tempData.privateKey =
        walletResponse.starknetWalletData.privateKey;

      // Set active wallet to Starknet if it's the only one imported
      if (!walletResponse.ethWalletData && !walletResponse.btcWalletData) {
        ctx.session.activeWallet = walletResponse.starknetWalletData.address;
      }
    }

    ctx.session.tempData = {};
    ctx.session.step = "wallet_imported";

    const keyboard = new InlineKeyboard()
      .text("🔄 Start Swapping", "swap_menu")
      .row()
      .text("👛 View Wallets", "list_wallets")
      .row()
      .text("🔙 Main Menu", "main_menu");

    // Build success message based on which wallets were imported
    let successMessage = "✅ *Wallets Imported Successfully!*\n\n";

    if (walletResponse.ethWalletData && walletResponse.ethWalletData.address) {
      successMessage += `*Ethereum Address:* \`${walletResponse.ethWalletData.address}\`\n`;
    }

    if (walletResponse.btcWalletData && walletResponse.btcWalletData.address) {
      successMessage += `*Bitcoin Address:* \`${walletResponse.btcWalletData.address}\`\n`;
    }

    if (walletResponse.starknetWalletData) {
      successMessage += `*Starknet Address:* \`${walletResponse.starknetWalletData.address}\`\n`;
    }

    successMessage += "\nWhat would you like to do next?";

    await ctx.reply(successMessage, {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    });
  } catch (error) {
    logger.error("Error importing wallets:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await ctx.reply(
      "❌ *Error Importing Wallets*\n\n" +
        `Error details: ${errorMessage}\n\n` +
        "Please check your input and try again.",
      {
        reply_markup: new InlineKeyboard().text("🔙 Back", "wallet_menu"),
        parse_mode: "Markdown",
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
        "❌ Something went wrong. Please start the swap process again.",
        {
          parse_mode: "Markdown",
        }
      );
      return;
    }

    if (!ctx.message?.text) {
      logger.error("Message or text is undefined");
      await ctx.reply("❌ Please enter a valid amount.", {
        parse_mode: "Markdown",
      });
      return;
    }

    const amount = parseFloat(ctx.message.text);

    if (isNaN(amount) || amount <= 0) {
      await ctx.reply(
        "❌ Please enter a valid positive number for the amount.",
        {
          parse_mode: "Markdown",
        }
      );
      return;
    }

    logger.info(`Valid amount entered: ${amount}`);

    ctx.session.swapParams = {
      ...ctx.session.swapParams,
      sendAmount: amount.toString(),
    };

    // Determine if we should offer to use imported wallet address or ask for manual entry
    const toAsset = ctx.session.swapParams.toAsset;
    let hasWallet = false;
    let walletAddress = "";
    let isDestinationBitcoin = false;
    if (toAsset) {
      isDestinationBitcoin = toAsset.chain.includes("bitcoin");
      if (ctx.session.wallets) {
        if (isDestinationBitcoin) {
          // Find a BTC wallet
          walletAddress =
            Object.values(ctx.session.wallets).find(
              (w) => w.chain === "bitcoin" && w.address
            )?.address || "";
          hasWallet = !!walletAddress;
        } else {
          // Find an EVM wallet
          walletAddress =
            Object.values(ctx.session.wallets).find(
              (w) => w.chain === "ethereum" && w.address
            )?.address || "";
          hasWallet = !!walletAddress;
        }
      }
    }

    if (hasWallet) {
      ctx.session.step = "choose_destination_method";
      ctx.session.tempData = ctx.session.tempData || {};
      ctx.session.tempData.walletDestinationAddress = walletAddress;
      await ctx.reply(`How would you like to set the destination address?`, {
        reply_markup: new InlineKeyboard()
          .text(
            isDestinationBitcoin ? "Use My BTC Wallet" : "Use My EVM Wallet",
            "use_wallet_address"
          )
          .text("Enter Manually", "enter_destination_manually")
          .row()
          .text("❌ Cancel", "swap_menu"),
        parse_mode: "Markdown",
      });
    } else {
      ctx.session.step = "enter_destination";
      logger.info(
        `Amount ${amount} stored in session, moving to destination address step`
      );
      await ctx.reply(
        "🔑 *Enter Destination Address*\n\n" +
          "Please enter the address where you want to receive the swapped tokens:",
        {
          reply_markup: new InlineKeyboard().text("❌ Cancel", "swap_menu"),
          parse_mode: "Markdown",
        }
      );
    }
  } catch (error) {
    logger.error("Error processing swap amount:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await ctx.reply(
      "❌ *Error Processing Amount*\n\n" +
        `Error details: ${errorMessage}\n\n` +
        "Please try again or start over.",
      {
        reply_markup: new InlineKeyboard().text("🔙 Back", "swap_menu"),
        parse_mode: "Markdown",
      }
    );
  }
}

// Handle callback queries for choosing destination method
export function handleDestinationMethodCallbacks(bot: Bot<BotContext>) {
  bot.callbackQuery("use_wallet_address", async (ctx) => {
    if (ctx.session.tempData && ctx.session.tempData.walletDestinationAddress) {
      ctx.session.swapParams = ctx.session.swapParams || {};
      ctx.session.swapParams.destinationAddress =
        ctx.session.tempData.walletDestinationAddress;
      ctx.session.step = "confirm_swap";
      // Clean up temp data
      delete ctx.session.tempData.walletDestinationAddress;
      await ctx.answerCallbackQuery();
      // Proceed to confirmation step
      await ctx.reply(
        `📝 *Swap Summary*\n\n` +
          `From: ${ctx.session.swapParams.sendAmount} ${
            ctx.session.swapParams.fromAsset?.chain.split("_").pop() || ""
          }\n` +
          `To: ${
            ctx.session.swapParams.toAsset?.chain.split("_").pop() || ""
          }\n` +
          `Destination Address: \`${ctx.session.swapParams.destinationAddress}\`\n\n` +
          `Please confirm if you want to proceed with this swap:`,
        {
          reply_markup: new InlineKeyboard()
            .text("✅ Confirm Swap", "confirm_swap")
            .row()
            .text("❌ Cancel", "swap_menu"),
          parse_mode: "Markdown",
        }
      );
    } else {
      await ctx.answerCallbackQuery({
        text: "No wallet address found in session.",
      });
    }
  });

  bot.callbackQuery("enter_destination_manually", async (ctx) => {
    ctx.session.step = "enter_destination";
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "🔑 *Enter Destination Address*\n\nPlease enter the address where you want to receive the swapped tokens:",
      {
        reply_markup: new InlineKeyboard().text("❌ Cancel", "swap_menu"),
        parse_mode: "Markdown",
      }
    );
  });
}

// Validation
async function handleDestinationAddress(ctx: BotContext) {
  if (!ctx.message?.text) {
    logger.error("Message or text is undefined");
    await ctx.reply("❌ Please enter a valid address.", {
      parse_mode: "Markdown",
    });
    return;
  }

  if (!ctx.session.swapParams?.toAsset) {
    logger.error("Missing toAsset in session");
    await ctx.reply("❌ Swap information is missing. Please start over.");
    return;
  }

  const address = ctx.message.text.trim();
  const isDestinationBitcoin =
    ctx.session.swapParams.toAsset.chain.includes("bitcoin");
  const isSourceBitcoin =
    ctx.session.swapParams.fromAsset?.chain.includes("bitcoin");

  logger.info(
    `Processing ${
      isDestinationBitcoin ? "Bitcoin" : "EVM"
    } destination address: ${address}`
  );

  let isValid = false;
  if (isDestinationBitcoin) {
    // Bitcoin address validation
    // Support for legacy, SegWit, Bech32, and testnet addresses
    const btcRegexes = [
      /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/, // Legacy and SegWit
      /^(bc1)[a-z0-9]{39,59}$/, // Bech32 mainnet
      /^(tb1)[a-z0-9]{39,59}$/, // Bech32 testnet
      /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/, // Testnet addresses
    ];
    isValid = btcRegexes.some((regex) => regex.test(address));

    // Reject EVM addresses for Bitcoin destinations
    if (address.startsWith("0x")) {
      isValid = false;
      await ctx.reply(
        "❌ You entered an EVM address, but a Bitcoin address is required for this swap. Please enter a valid Bitcoin address.",
        {
          parse_mode: "Markdown",
        }
      );
      return;
    }
  } else {
    try {
      isValid = isAddress(address);

      // Reject Bitcoin addresses for EVM destinations
      if (!address.startsWith("0x")) {
        isValid = false;
        await ctx.reply(
          "❌ You entered what appears to be a Bitcoin address, but an EVM address is required for this swap. Please enter a valid EVM address starting with '0x'.",
          {
            parse_mode: "Markdown",
          }
        );
        return;
      }
    } catch (error) {
      logger.error("Error validating EVM address:", error);
      isValid = false;
    }
  }

  if (!isValid) {
    const chainType = isDestinationBitcoin ? "Bitcoin" : "EVM";
    await ctx.reply(
      `❌ Invalid ${chainType} address format. Please try again.`,
      {
        parse_mode: "Markdown",
      }
    );
    return;
  }

  if (!ctx.session.swapParams) {
    ctx.session.swapParams = {};
  }

  ctx.session.swapParams.destinationAddress = address;
  ctx.session.step = "confirm_swap";

  const fromAsset = ctx.session.swapParams.fromAsset;
  const toAsset = ctx.session.swapParams.toAsset;
  const sendAmount = ctx.session.swapParams.sendAmount;

  if (!fromAsset || !toAsset || !sendAmount) {
    await ctx.reply("❌ Swap information is missing. Please start over.");
    return;
  }

  const fromChain = fromAsset.chain.split("_").pop();
  const toChain = toAsset.chain.split("_").pop();

  const keyboard = new InlineKeyboard()
    .text("✅ Confirm Swap", "confirm_swap")
    .row()
    .text("❌ Cancel", "swap_menu");

  await ctx.reply(
    "📝 *Swap Summary*\n\n" +
      `From: ${sendAmount} ${fromChain}\n` +
      `To: ${toChain}\n` +
      `Destination Address: \`${address}\`\n\n` +
      "Please confirm if you want to proceed with this swap:",
    {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    }
  );
}

async function handleStarknetAddressInput(ctx: BotContext) {
  if (!ctx.message?.text) {
    logger.error("Message or text is undefined");
    await ctx.reply("❌ Please enter a valid Starknet address.", {
      parse_mode: "Markdown",
    });
    return;
  }

  const starknetAddress = ctx.message.text.trim();

  // Basic validation for Starknet address (should start with 0x and be the right length)
  if (!starknetAddress.startsWith("0x") || starknetAddress.length !== 66) {
    await ctx.reply(
      "❌ Invalid Starknet address format. Please enter a valid address starting with '0x' and 64 characters long.",
      {
        parse_mode: "Markdown",
      }
    );
    return;
  }

  // Store the Starknet address in tempData
  if (!ctx.session.tempData) {
    ctx.session.tempData = {};
  }
  ctx.session.tempData.starknetAddress = starknetAddress;

  // Now ask for the private key
  ctx.session.step = "wallet_import";

  const keyboard = new InlineKeyboard().text("❌ Cancel", "wallet_menu");

  await ctx.reply(
    "🔑 *Import Private Key for Starknet*\n\n" +
      "Please enter your Starknet wallet private key:\n\n" +
      "*Format: hex string (with or without 0x prefix)*",
    {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    }
  );
}

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
    logger.info(`Received text message in step: ${ctx.session.step}`);

    // Handle different steps
    switch (ctx.session.step) {
      case "wallet_import":
        await handleWalletImport(ctx, starknetService);
        break;
      case "swap_amount":
        await handleSwapAmount(ctx);
        break;
      case "enter_destination":
        await handleDestinationAddress(ctx, starknetService);
        break;
      case "enter_starknet_address":
        await handleStarknetAddressInput(ctx, starknetService);
        break;
      default:
        logger.info("Unknown step or general message");
        await ctx.reply("I'm sorry, I didn't understand that.");
    }
  });
}

async function handleWalletImport(ctx: BotContext, starknetService: StarknetService) {
  if (!ctx.message?.text) {
    logger.error("Message or text is undefined");
    await ctx.reply("❌ Invalid message format. Please try again.");
    return;
  }
  const text = ctx.message.text.trim();
  logger.info(
    `Processing wallet import with text (first 10 chars): ${text.substring(0, 10)}...`
  );

  if (!ctx.session.tempData?.importType || !ctx.session.tempData?.importChain) {
    logger.error("Import type or chain not found in tempData");
    await ctx.reply("❌ Please start the import process again.", {
      parse_mode: "Markdown",
    });
    return;
  }

  const isPrivateKey = ctx.session.tempData.importType === "private_key";
  const importChain = ctx.session.tempData.importChain;
  logger.info(
    `Attempting to import via: ${isPrivateKey ? "private key" : "mnemonic"} for chain: ${importChain}`
  );

  try {
    await ctx.reply("⏳ *Importing wallet...*", {
      parse_mode: "Markdown",
    });

    let walletData;
    const starknetAddress = ctx.session.tempData.starknetAddress;
    const chain = arbitrumSepolia as Chain; // Default EVM chain

    if (isPrivateKey) {
      const privateKey = text.startsWith("0x") ? text : `0x${text}`;
      if (importChain === "ethereum") {
        walletData = await WalletService.importEthereumFromPrivateKey(privateKey, chain);
      } else if (importChain === "bitcoin") {
        walletData = await WalletService.importBitcoinFromPrivateKey(privateKey);
      } else if (importChain === "starknet") {
        if (!starknetAddress) throw new Error("Starknet address required");
        walletData = WalletService.importStarknetFromPrivateKey(privateKey, starknetAddress, starknetService);
      }
    } else {
      if (importChain === "ethereum") {
        walletData = await WalletService.importEthereumFromMnemonic(text, chain);
      } else if (importChain === "bitcoin") {
        walletData = await WalletService.importBitcoinFromMnemonic(text);
      } else if (importChain === "starknet") {
        if (!starknetAddress) throw new Error("Starknet address required");
        walletData = WalletService.importStarknetFromMnemonic(text, starknetAddress, starknetService);
      }
    }

    if (!walletData) {
      throw new Error("Failed to import wallet. Please check your input and try again.");
    }

    if (!ctx.session.wallets) ctx.session.wallets = {};
    ctx.session.wallets[walletData.address] = walletData;
    ctx.session.activeWallet = walletData.address;
    ctx.session.tempData = {};
    ctx.session.step = "wallet_imported";

    const keyboard = new InlineKeyboard()
      .text("🔄 Start Swapping", "swap_menu")
      .row()
      .text("👛 View Wallets", "list_wallets")
      .row()
      .text("🔙 Main Menu", "main_menu");

    let successMessage = "✅ *Wallet Imported Successfully!*\n\n";
    if (importChain === "ethereum") {
      successMessage += `*Ethereum Address:* \`${walletData.address}\`\n`;
    } else if (importChain === "bitcoin") {
      successMessage += `*Bitcoin Address:* \`${walletData.address}\`\n`;
    } else if (importChain === "starknet") {
      successMessage += `*Starknet Address:* \`${walletData.address}\`\n`;
    }
    successMessage += "\nWhat would you like to do next?";

    await ctx.reply(
      successMessage,
      {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      }
    );
  } catch (error) {
    logger.error("Error importing wallet:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await ctx.reply(
      "❌ *Error Importing Wallet*\n\n" +
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

    // Check if amount is within acceptable range (0.0005 to 0.1)
    if (amount < 0.0005 || amount > 0.1) {
      await ctx.reply(
        "❌ The amount you entered is outside the acceptable range. Please enter an amount between 0.0005 and 0.1 tokens.",
        {
          parse_mode: "Markdown",
        }
      );
      return;
    }

    // Get decimals from the network or asset
    const network = ctx.session.swapParams.selectedNetwork;
    const fromAsset = ctx.session.swapParams.fromAsset;
    const decimals = fromAsset?.decimals || network?.nativeCurrency?.decimals || 18;

    // Calculate the adjusted amount with decimals
    const adjustedAmount = amount * (10 ** decimals);

    // Log detailed information about the amount conversion
    logger.info(`Valid amount entered: ${amount}`);
    logger.info(`Using decimals: ${decimals} for conversion`);
    logger.info(`Adjusted amount with decimals: ${adjustedAmount}`);
    logger.info(`Conversion factor: 10^${decimals} = ${10 ** decimals}`);

    ctx.session.swapParams = {
      ...ctx.session.swapParams,
      sendAmount: amount.toString(),
    };

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
async function handleDestinationAddress(ctx: BotContext, starknetService: StarknetService) {
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
  const isDestinationBitcoin = ctx.session.swapParams.toAsset.chain.includes('bitcoin');
  const isDestinationStarknet = ctx.session.swapParams.toAsset.chain.includes('starknet');
  const isSourceBitcoin = ctx.session.swapParams.fromAsset?.chain.includes('bitcoin');

  logger.info(`Processing ${isDestinationBitcoin ? 'Bitcoin' : isDestinationStarknet ? 'Starknet' : 'EVM'} destination address: ${address}`);

  let isValid = false;
  if (isDestinationBitcoin) {
    // Bitcoin address validation
    // Support for legacy, SegWit, Bech32, and testnet addresses
    const btcRegexes = [
      /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/, // Legacy and SegWit
      /^(bc1)[a-z0-9]{39,59}$/, // Bech32 mainnet
      /^(tb1)[a-z0-9]{39,59}$/, // Bech32 testnet
      /^[mn2][a-km-zA-HJ-NP-Z1-9]{25,34}$/ // Testnet addresses
    ];
    isValid = btcRegexes.some(regex => regex.test(address));

    // Reject EVM addresses for Bitcoin destinations
    if (address.startsWith('0x')) {
      isValid = false;
      await ctx.reply("❌ You entered an EVM address, but a Bitcoin address is required for this swap. Please enter a valid Bitcoin address.", {
        parse_mode: "Markdown",
      });
      return;
    }
  } else if (isDestinationStarknet) {
    // Starknet address validation: must start with '0x' and be at least 10 chars
    isValid = address.startsWith('0x') && address.length >= 10;

    if (!(starknetService.getProvider().getClassHashAt(address))) {
      logger.info("User didn't deploy the starknet address...");
      await ctx.reply("Starknet address is not deployed kindly deploy to make transactions.");
      return;
    }


    if (!isValid) {
      await ctx.reply("❌ Invalid Starknet address format. Please enter a valid Starknet address.", {
        parse_mode: "Markdown",
      });
      return;
    }
  } else {
    try {
      isValid = isAddress(address);

      // Reject Bitcoin addresses for EVM destinations
      if (!address.startsWith('0x')) {
        isValid = false;
        await ctx.reply("❌ You entered what appears to be a Bitcoin address, but an EVM address is required for this swap. Please enter a valid EVM address starting with '0x'.", {
          parse_mode: "Markdown",
        });
        return;
      }
    } catch (error) {
      logger.error("Error validating EVM address:", error);
      isValid = false;
    }
  }

  if (!isValid) {
    const chainType = isDestinationBitcoin ? 'Bitcoin' : isDestinationStarknet ? 'Starknet' : 'EVM';
    await ctx.reply(`❌ Invalid ${chainType} address format. Please try again.`, {
      parse_mode: "Markdown",
    });
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

  // Get proper chain names instead of just the chain ID parts
  const fromChainName = fromAsset.chain
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  const toChainName = toAsset.chain
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  // Get proper token symbols
  const fromSymbol = fromAsset.symbol || ctx.session.swapParams.selectedNetwork?.nativeCurrency?.symbol || "";
  const toSymbol = toAsset.symbol || "";

  const keyboard = new InlineKeyboard()
    .text("✅ Confirm Swap", "confirm_swap")
    .row()
    .text("❌ Cancel", "swap_menu");

  await ctx.reply(
    "📝 *Swap Summary*\n\n" +
    `From: ${sendAmount} ${fromChainName} (${fromSymbol})\n` +
    `To: ${toChainName} (${toSymbol})\n` +
    `Destination Address: \`${address}\`\n\n` +
    "Please confirm if you want to proceed with this swap:",
    {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    }
  );
}

export async function handleTextMessage(
  ctx: BotContext,
  starknetService: StarknetService
) {
  const step = ctx.session.step;
  logger.info(`Received text message. Current step: ${step}, Text: ${ctx.message?.text?.substring(0, 50)}`);

  try {
    switch (step) {
      case "wallet_import":
        await handleWalletImport(ctx, starknetService);
        break;
      case "enter_starknet_address":
        await handleStarknetAddressInput(ctx, starknetService);
        break;
      case "swap_amount":
        await handleSwapAmount(ctx);
        break;
      case "enter_destination":
        await handleDestinationAddress(ctx, starknetService);
        return;
      default:
        logger.info(`Unhandled text message in step: ${step}`);
        break;
    }
  } catch (error) {
    logger.error("Error handling text message:", error);
    await ctx.reply("❌ An error occurred. Please try again.");
  }
}

async function handleStarknetAddressInput(ctx: BotContext, starknetService: StarknetService) {
  if (!ctx.message?.text) {
    logger.error("Message or text is undefined");
    await ctx.reply("❌ Invalid message format. Please try again.");
    return;
  }

  const text = ctx.message.text.trim();
  logger.info(`Processing Starknet address: ${text}`);

  if (!(starknetService.getProvider().getClassHashAt(text))) {
    logger.info("User didn't deploy the starknet address...");
    await ctx.reply("Starknet address is not deployed kindly deploy to make transactions.");
    return;
  }

  if (!ctx.session.tempData) {
    ctx.session.tempData = {};
  }


  // Check if user wants to skip
  if (text.toLowerCase() === 'skip') {
    logger.info("User skipped Starknet address input");
    ctx.session.tempData.starknetAddress = undefined;
    ctx.session.step = "wallet_import";

    // Proceed to ask for private key or mnemonic
    const importType = ctx.session.tempData.importType;
    const selectedChain = ctx.session.tempData.selectedChain || "ethereum";

    const title = importType === "private_key"
      ? "🔑 *Import Private Key*"
      : "📝 *Import Mnemonic Phrase*";

    const format = importType === "private_key"
      ? "Format: hex string (with or without 0x prefix)"
      : "Format: 12 or 24 word mnemonic phrase";

    const keyboard = new InlineKeyboard().text("❌ Cancel", "wallet_menu");

    await ctx.reply(
      `${title}\n\n` +
      `Please enter your ${importType === "private_key" ? "private key" : "mnemonic phrase"} ` +
      `to import your wallet:\n\n` +
      `*${format}*`,
      {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      }
    );
    return;
  }

  // Validate Starknet address (basic validation)
  if (!text.startsWith('0x') || text.length < 10) {
    await ctx.reply(
      "❌ Invalid Starknet address format. Please enter a valid address or type 'skip'.",
      {
        reply_markup: new InlineKeyboard().text("❌ Cancel", "wallet_menu"),
      }
    );
    return;
  }

  // Store the address and move to next step
  logger.info(`Storing Starknet address: ${text}`);
  ctx.session.tempData.starknetAddress = text;
  ctx.session.step = "wallet_import";

  // Proceed to ask for private key or mnemonic
  const importType = ctx.session.tempData.importType;
  const title = importType === "private_key"
    ? "🔑 *Import Private Key*"
    : "📝 *Import Mnemonic Phrase*";

  const format = importType === "private_key"
    ? "Format: hex string (with or without 0x prefix)"
    : "Format: 12 or 24 word mnemonic phrase";

  const keyboard = new InlineKeyboard().text("❌ Cancel", "wallet_menu");

  await ctx.reply(
    `${title}\n\n` +
    `Please enter your ${importType === "private_key" ? "private key" : "mnemonic phrase"} ` +
    `to import your wallet:\n\n` +
    `*${format}*`,
    {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    }
  );
}

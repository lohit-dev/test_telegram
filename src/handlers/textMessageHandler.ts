import { Bot, InlineKeyboard } from "grammy";
import { Chain, isAddress } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { StarknetService } from "../services/starknet";
import { WalletService } from "../services/wallet";
import { BotContext } from "../types";
import { logger } from "../utils/logger";

export function handleTextMessages(
  bot: Bot<BotContext>,
  starknetService: StarknetService
): void {
  handleDestinationSelectionCallbacks(bot, starknetService);

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
    `Attempting to import via: ${
      isPrivateKey ? "private key" : "mnemonic"
    } for chain: ${importChain}`
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
        walletData = await WalletService.importEthereumFromPrivateKey(
          privateKey,
          chain
        );
      } else if (importChain === "bitcoin") {
        walletData = await WalletService.importBitcoinFromPrivateKey(
          privateKey
        );
      } else if (importChain === "starknet") {
        if (!starknetAddress) throw new Error("Starknet address required");

        // Check if the contract exists at the address before importing
        const contractExists = await starknetService.checkContractExists(
          starknetAddress
        );

        walletData = WalletService.importStarknetFromPrivateKey(
          privateKey,
          starknetAddress,
          starknetService
        );

        // If contract doesn't exist, add a warning to the wallet data
        if (!contractExists) {
          walletData.contractDeployed = false;
        } else {
          walletData.contractDeployed = true;
        }
      }
    } else {
      if (importChain === "ethereum") {
        walletData = await WalletService.importEthereumFromMnemonic(
          text,
          chain
        );
      } else if (importChain === "bitcoin") {
        walletData = await WalletService.importBitcoinFromMnemonic(text);
      } else if (importChain === "starknet") {
        if (!starknetAddress) throw new Error("Starknet address required");

        const contractExists = await starknetService.checkContractExists(
          starknetAddress
        );

        walletData = WalletService.importStarknetFromMnemonic(
          text,
          starknetAddress,
          starknetService
        );

        if (!contractExists) {
          walletData.contractDeployed = false;
        } else {
          walletData.contractDeployed = true;
        }
      }
    }

    if (!walletData) {
      throw new Error(
        "Failed to import wallet. Please check your input and try again."
      );
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

      if (walletData.contractDeployed === false) {
        successMessage +=
          "\n⚠️ *WARNING:* The contract for this wallet is not deployed. You won't be able to make transactions until the contract is deployed.\n";
      }
    }
    successMessage += "\nWhat would you like to do next?";

    await ctx.reply(successMessage, {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    });
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

    const network = ctx.session.swapParams.selectedNetwork;
    const fromAsset = ctx.session.swapParams.fromAsset;
    const decimals = fromAsset?.decimals || network?.nativeCurrency?.decimals;
    const adjustedAmount = amount * 10 ** decimals!;

    logger.info(`Valid amount entered: ${amount}`);
    logger.info(`Using decimals: ${decimals} for conversion`);
    logger.info(`Adjusted amount with decimals: ${adjustedAmount}`);
    logger.info(`Conversion factor: 10^${decimals} = ${10 ** decimals!}`);

    ctx.session.swapParams = {
      ...ctx.session.swapParams,
      sendAmount: adjustedAmount.toString(),
    };

    await showDestinationWalletOptions(ctx);
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

async function showDestinationWalletOptions(ctx: BotContext) {
  logger.info("Showing destination wallet options");

  const toAsset = ctx.session.swapParams?.toAsset;
  if (!toAsset) {
    logger.error("Missing toAsset in session");
    await ctx.reply("❌ Swap information is missing. Please start over.");
    return;
  }

  const isDestinationBitcoin = toAsset.chain.includes("bitcoin");
  const isDestinationStarknet = toAsset.chain.includes("starknet");
  const chainType = isDestinationBitcoin
    ? "Bitcoin"
    : isDestinationStarknet
    ? "Starknet"
    : "EVM";

  // Check if user has any compatible wallets
  const wallets = ctx.session.wallets || {};
  const compatibleWallets: { address: string; type: string }[] = [];

  Object.entries(wallets).forEach(([address, wallet]: [string, any]) => {
    // Check if the wallet chain is compatible with destination
    const walletChain = wallet.chain || "";

    logger.info(`Got Addressess: ${address}`);

    if (
      (isDestinationBitcoin && walletChain.includes("bitcoin")) ||
      (isDestinationStarknet && walletChain.includes("starknet")) ||
      (!isDestinationBitcoin &&
        !isDestinationStarknet &&
        !walletChain.includes("bitcoin") &&
        !walletChain.includes("starknet"))
    ) {
      compatibleWallets.push({
        address,
        type: walletChain.includes("bitcoin")
          ? "Bitcoin"
          : walletChain.includes("starknet")
          ? "Starknet"
          : "EVM",
      });
    }
  });

  // Build the keyboard with wallet options
  const keyboard = new InlineKeyboard();

  const maxDisplayedWallets = Math.min(compatibleWallets.length, 5);
  for (let i = 0; i < maxDisplayedWallets; i++) {
    const wallet = compatibleWallets[i];
    const displayAddress =
      wallet.address.length > 16
        ? `${wallet.address.slice(0, 8)}...${wallet.address.slice(-8)}`
        : wallet.address;

    keyboard.text(
      `${wallet.type}: ${displayAddress}`,
      `select_wallet_${wallet.address}`
    );
    keyboard.row();
  }

  keyboard.text("Enter Manually", "enter_destination_manually");
  keyboard.row();

  keyboard.text("❌ Cancel", "swap_menu");

  ctx.session.step = "selecting_destination";

  await ctx.reply(
    `🔍 *Choose Destination Address*\n\n` +
      `Please select one of your ${chainType} wallets as the destination or enter a new address manually:`,
    {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    }
  );
}

export function handleDestinationSelectionCallbacks(
  bot: Bot<BotContext>,
  starknetService: StarknetService
): void {
  bot.callbackQuery(/^select_wallet_(.+)$/, async (ctx) => {
    try {
      const selectedAddress = ctx.match[1];
      logger.info(`Selected destination wallet: ${selectedAddress}`);

      // Set the selected address as the destination
      if (!ctx.session.swapParams) {
        ctx.session.swapParams = {};
      }

      // Set the selected wallet as both destination and active wallet
      ctx.session.swapParams.destinationAddress = selectedAddress;
      ctx.session.activeWallet = selectedAddress;
      ctx.session.step = "confirm_swap";

      await ctx.answerCallbackQuery("Address selected!");

      // Now display the confirmation
      await displaySwapConfirmation(ctx);
    } catch (error) {
      logger.error("Error handling wallet selection:", error);
      await ctx.answerCallbackQuery("Error selecting wallet");
      await ctx.reply("❌ An error occurred. Please try again.");
    }
  });

  // Handle manual entry request
  bot.callbackQuery("enter_destination_manually", async (ctx) => {
    try {
      logger.info("User chose to enter destination address manually");

      ctx.session.step = "enter_destination";

      await ctx.answerCallbackQuery();

      await ctx.reply(
        "🔑 *Enter Destination Address*\n\n" +
          "Please enter the address where you want to receive the swapped tokens:",
        {
          reply_markup: new InlineKeyboard().text("❌ Cancel", "swap_menu"),
          parse_mode: "Markdown",
        }
      );
    } catch (error) {
      logger.error("Error handling manual entry selection:", error);
      await ctx.answerCallbackQuery("Error processing request");
      await ctx.reply("❌ An error occurred. Please try again.");
    }
  });
}

// Function to display swap confirmation with all parameters
async function displaySwapConfirmation(ctx: BotContext) {
  const fromAsset = ctx.session.swapParams?.fromAsset;
  const toAsset = ctx.session.swapParams?.toAsset;
  const sendAmount = ctx.session.swapParams?.sendAmount;
  const destinationAddress = ctx.session.swapParams?.destinationAddress;

  if (!fromAsset || !toAsset || !sendAmount || !destinationAddress) {
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
  const fromSymbol =
    fromAsset.symbol ||
    ctx.session.swapParams?.selectedNetwork?.nativeCurrency?.symbol ||
    "";
  const toSymbol = toAsset.symbol || "";

  // Truncate address for display if needed
  const displayAddress =
    destinationAddress.length > 24
      ? `${destinationAddress.slice(0, 12)}...${destinationAddress.slice(-12)}`
      : destinationAddress;

  const keyboard = new InlineKeyboard()
    .text("✅ Confirm Swap", "confirm_swap")
    .row()
    .text("❌ Cancel", "swap_menu");

  await ctx.reply(
    "📝 *Swap Summary*\n\n" +
      `From: ${sendAmount} ${fromChainName} (${fromSymbol})\n` +
      `To: ${toChainName} (${toSymbol})\n` +
      `Destination Address: \`${displayAddress}\`\n\n` +
      "Please confirm if you want to proceed with this swap:",
    {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    }
  );
}

async function handleDestinationAddress(
  ctx: BotContext,
  starknetService: StarknetService
) {
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
  const isDestinationStarknet =
    ctx.session.swapParams.toAsset.chain.includes("starknet");
  const isSourceBitcoin =
    ctx.session.swapParams.fromAsset?.chain.includes("bitcoin");

  logger.info(
    `Processing ${
      isDestinationBitcoin
        ? "Bitcoin"
        : isDestinationStarknet
        ? "Starknet"
        : "EVM"
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
  } else if (isDestinationStarknet) {
    // Starknet address validation: must start with '0x' and be at least 10 chars
    isValid = address.startsWith("0x") && address.length >= 10;

    if (!starknetService.getProvider().getClassHashAt(address)) {
      logger.info("User didn't deploy the starknet address...");
      await ctx.reply(
        "Starknet address is not deployed kindly deploy to make transactions."
      );
      return;
    }

    if (!isValid) {
      await ctx.reply(
        "❌ Invalid Starknet address format. Please enter a valid Starknet address.",
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
    const chainType = isDestinationBitcoin
      ? "Bitcoin"
      : isDestinationStarknet
      ? "Starknet"
      : "EVM";
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

  // Call the function to display swap confirmation
  await displaySwapConfirmation(ctx);
}

export async function handleTextMessage(
  ctx: BotContext,
  starknetService: StarknetService
) {
  const step = ctx.session.step;
  logger.info(
    `Received text message. Current step: ${step}, Text: ${ctx.message?.text?.substring(
      0,
      50
    )}`
  );

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

async function handleStarknetAddressInput(
  ctx: BotContext,
  starknetService: StarknetService
) {
  if (!ctx.message?.text) {
    logger.error("Message or text is undefined");
    await ctx.reply("❌ Invalid message format. Please try again.");
    return;
  }

  const text = ctx.message.text.trim();
  logger.info(`Processing Starknet address: ${text}`);

  if (!starknetService.getProvider().getClassHashAt(text)) {
    logger.info("User didn't deploy the starknet address...");
    await ctx.reply(
      "Starknet address is not deployed kindly deploy to make transactions."
    );
    return;
  }

  if (!ctx.session.tempData) {
    ctx.session.tempData = {};
  }

  // Check if user wants to skip
  if (text.toLowerCase() === "skip") {
    logger.info("User skipped Starknet address input");
    ctx.session.tempData.starknetAddress = undefined;
    ctx.session.step = "wallet_import";

    // Proceed to ask for private key or mnemonic
    const importType = ctx.session.tempData.importType;
    const selectedChain = ctx.session.tempData.selectedChain || "ethereum";

    const title =
      importType === "private_key"
        ? "🔑 *Import Private Key*"
        : "📝 *Import Mnemonic Phrase*";

    const format =
      importType === "private_key"
        ? "Format: hex string (with or without 0x prefix)"
        : "Format: 12 or 24 word mnemonic phrase";

    const keyboard = new InlineKeyboard().text("❌ Cancel", "wallet_menu");

    await ctx.reply(
      `${title}\n\n` +
        `Please enter your ${
          importType === "private_key" ? "private key" : "mnemonic phrase"
        } ` +
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
  if (!text.startsWith("0x") || text.length < 10) {
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
  const title =
    importType === "private_key"
      ? "🔑 *Import Private Key*"
      : "📝 *Import Mnemonic Phrase*";

  const format =
    importType === "private_key"
      ? "Format: hex string (with or without 0x prefix)"
      : "Format: 12 or 24 word mnemonic phrase";

  const keyboard = new InlineKeyboard().text("❌ Cancel", "wallet_menu");

  await ctx.reply(
    `${title}\n\n` +
      `Please enter your ${
        importType === "private_key" ? "private key" : "mnemonic phrase"
      } ` +
      `to import your wallet:\n\n` +
      `*${format}*`,
    {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    }
  );
}

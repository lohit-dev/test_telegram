import { Bot, InlineKeyboard } from "grammy";
import { Chain, isAddress } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { StarknetService } from "../services/starknet";
import { WalletService } from "../services/wallet";
import { BotContext } from "../types";
import { logger } from "../utils/logger";
import { AuthHandler } from "./auth-handler";
import { DbWalletService } from "../services/db-wallet";
import { PrismaClient } from "@prisma/client";
import { EncryptionService } from "../utils/encryption";

const prisma = new PrismaClient();

export function handleTextMessages(
  bot: Bot<BotContext>,
  starknetService: StarknetService,
): void {
  handleDestinationSelectionCallbacks(bot, starknetService);

  bot.on("message:text", async (ctx) => {
    await handleTextMessage(ctx, starknetService);
  });
}

async function handleWalletImport(
  ctx: BotContext,
  starknetService: StarknetService,
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
      10,
    )}...`,
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
    } for chain: ${importChain}`,
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
          chain,
        );
      } else if (importChain === "bitcoin") {
        walletData =
          await WalletService.importBitcoinFromPrivateKey(privateKey);
      } else if (importChain === "starknet") {
        if (!starknetAddress) throw new Error("Starknet address required");

        // Check if the contract exists at the address before importing
        const contractExists =
          await starknetService.checkContractExists(starknetAddress);

        walletData = WalletService.importStarknetFromPrivateKey(
          privateKey,
          starknetAddress,
          starknetService,
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
          chain,
        );
      } else if (importChain === "bitcoin") {
        walletData = await WalletService.importBitcoinFromMnemonic(text);
      } else if (importChain === "starknet") {
        if (!starknetAddress) throw new Error("Starknet address required");

        const contractExists =
          await starknetService.checkContractExists(starknetAddress);

        walletData = WalletService.importStarknetFromMnemonic(
          text,
          starknetAddress,
          starknetService,
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
        "Failed to import wallet. Please check your input and try again.",
      );
    }

    if (!ctx.session.wallets) ctx.session.wallets = {};
    ctx.session.wallets[walletData.address] = walletData;
    ctx.session.activeWallet = walletData.address;
    ctx.session.tempData = {};
    ctx.session.step = "wallet_imported";

    const keyboard = new InlineKeyboard()
      .text("🔄 Start Swapping", "swap_menu")
      .row();

    if (importChain === "starknet" && walletData.contractDeployed === false) {
      keyboard.text("🚀 Deploy Contract", "deploy_starknet_contract").row();
    }

    keyboard
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
          "\n⚠️ *WARNING:* The contract for this wallet is not deployed. You won't be able to make transactions until the contract is deployed.\n\n\n*💰 Add Money to this address and click on the Deploy Contract button to deploy it.*";
      }
    }
    successMessage += "\nWhat would you like to do next?";

    await ctx.reply(successMessage, {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    });

    if (ctx.from?.id) {
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
      });
      if (!user) {
        logger.error("User not found in DB");
        await ctx.reply("❌ User not found. Please register first.");
        return;
      }
      // Get the user's password from active sessions instead of using the private key
      const userPassword = AuthHandler.getPassword(BigInt(ctx.from.id));
      if (!userPassword) {
        logger.error("User password not found in active sessions");
        await ctx.reply("❌ Authentication error. Please log in again.");
        return;
      }

      // Save wallet with the user's password for proper encryption
      await DbWalletService.saveWallet(user.id, walletData, userPassword);
    } else {
      logger.error("User ID is undefined");
    }
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
      },
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
        },
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
        },
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
      },
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
      `select_wallet_${wallet.address}`,
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
    },
  );
}

export function handleDestinationSelectionCallbacks(
  bot: Bot<BotContext>,
  starknetService: StarknetService,
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

      // Done
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
        },
      );
    } catch (error) {
      logger.error("Error handling manual entry selection:", error);
      await ctx.answerCallbackQuery("Error processing request");
      await ctx.reply("❌ An error occurred. Please try again.");
    }
  });
}

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
    },
  );
}

async function handleDestinationAddress(
  ctx: BotContext,
  starknetService: StarknetService,
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
    } destination address: ${address}`,
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
        },
      );
      return;
    }
  } else if (isDestinationStarknet) {
    // Starknet address validation: must start with '0x' and be at least 10 chars
    isValid = address.startsWith("0x") && address.length >= 10;

    if (!starknetService.getProvider().getClassHashAt(address)) {
      logger.info("User didn't deploy the starknet address...");
      await ctx.reply(
        "Starknet address is not deployed kindly deploy to make transactions.",
      );
      return;
    }

    if (!isValid) {
      await ctx.reply(
        "❌ Invalid Starknet address format. Please enter a valid Starknet address.",
        {
          parse_mode: "Markdown",
        },
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
          },
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
      },
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
  starknetService: StarknetService,
) {
  const step = ctx.session.step;
  logger.info(
    `Received text message. Current step: ${step}, Text: ${ctx.message?.text?.substring(
      0,
      50,
    )}`,
  );

  try {
    switch (step) {
      case "register":
        await handleRegistration(ctx);
        break;
      case "login":
        await handleLogin(ctx);
        break;
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
        break;
      default:
        logger.info(`Unhandled text message in step: ${step}`);
        await ctx.reply(
          "I don't understand that command. Please use the menu buttons or type /help for available commands.",
        );
        break;
    }
  } catch (error) {
    logger.error("Error handling text message:", error);
    await ctx.reply("❌ An error occurred. Please try again.");
  }
}

async function handleRegistration(ctx: BotContext) {
  if (!ctx.message?.text || !ctx.from?.id) {
    await ctx.reply("❌ Invalid input. Please try again.");
    return;
  }

  const telegramId = ctx.from.id;
  const password = ctx.message.text.trim();

  logger.info(
    `Handling registration for user ${telegramId} with password length: ${password.length}`,
  );

  // Check password length
  if (password.length < 8) {
    await ctx.reply(
      "⚠️ *Password too short*\n\n" +
        "Please enter a password that is at least 8 characters long.",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("❌ Cancel", "main_menu"),
      },
    );
    return;
  }

  try {
    logger.info("Calling AuthHandler.register");
    const result = await AuthHandler.register(BigInt(telegramId), password);
    logger.info(`Registration result: ${result}`);

    // If registration is successful, set session as authenticated
    if (result && result.toLowerCase().includes("successful")) {
      ctx.session.isAuthenticated = true;
      ctx.session.step = "initial";
      logger.info("User marked as authenticated in session");
    }

    await ctx.reply(result, {
      reply_markup: new InlineKeyboard()
        .text("👛 Create Wallet", "wallet_menu")
        .row()
        .text("🔙 Main Menu", "main_menu"),
    });

    // Reset session step
    ctx.session.step = "initial";
    logger.info(
      "Registration process completed, session step reset to initial",
    );
  } catch (error) {
    logger.error("Error during registration:", error);
    await ctx.reply(
      "❌ *Registration Error*\n\n" +
        "There was an error creating your account. Please try again later.",
      {
        parse_mode: "Markdown",
      },
    );
  }
}

async function handleLogin(ctx: BotContext) {
  if (!ctx.message?.text || !ctx.from?.id) {
    await ctx.reply("❌ Invalid input. Please try again.");
    return;
  }

  const telegramId = ctx.from.id;
  const password = ctx.message.text.trim();

  try {
    const result = await AuthHandler.login(BigInt(telegramId), password);

    if (result && result.toLowerCase().includes("successful")) {
      ctx.session.isAuthenticated = true;
      ctx.session.step = "initial";
      logger.info("User marked as authenticated in session");

      // Load wallets from DB
      const user = await prisma.user.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
        include: { wallets: true },
      });

      if (user && user.wallets) {
        ctx.session.wallets = {};

        // Process each wallet and decrypt sensitive information
        for (const wallet of user.wallets) {
          try {
            // Get the fully decrypted wallet data using the DbWalletService
            const decryptedWallet = await DbWalletService.getWallet(
              user.id,
              wallet.id,
              password,
            );

            // Store in session with decrypted values
            ctx.session.wallets[wallet.address] = {
              address: wallet.address,
              chain: wallet.chain,
              connected: false,
              publicKey: wallet.publicKey?.toString() || undefined,
              privateKey: decryptedWallet.privateKey,
              mnemonic: decryptedWallet.mnemonic,
            };

            logger.info(
              `Successfully loaded wallet: ${wallet.address.slice(0, 6)}...`,
            );
          } catch (decryptError) {
            logger.error(`Error decrypting wallet data: ${decryptError}`);

            // Add wallet without sensitive data if decryption fails
            ctx.session.wallets[wallet.address] = {
              address: wallet.address,
              chain: wallet.chain,
              connected: false,
              publicKey: wallet.publicKey?.toString() || undefined,
            };
          }
        }

        logger.info(
          `Loaded and decrypted ${Object.keys(ctx.session.wallets).length} wallets for user`,
        );

        if (ctx.session.activeWallet) {
          logger.info(`Active wallet is: ${ctx.session.activeWallet}`);
        } else {
          // Set the first wallet as active if none is set
          const firstWalletAddress = Object.keys(ctx.session.wallets)[0];
          if (firstWalletAddress) {
            ctx.session.activeWallet = firstWalletAddress;
            logger.info(`Set first wallet as active: ${firstWalletAddress}`);
          }
        }
      }

      await ctx.reply(
        "✅ *Login Successful!*\n\n" +
          "You are now logged in and can access your wallets and perform swaps.",
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("👛 Manage Wallets", "wallet_menu")
            .row()
            .text("🔄 Swap", "swap_menu"),
        },
      );
      ctx.session.step = "initial";
    } else {
      await ctx.reply(
        "❌ *Login Failed*\n\n" +
          "Invalid password or account not found.\n\n" +
          "Please try again or register a new account.",
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("🔐 Try Again", "login_account")
            .row()
            .text("📝 Register", "register_account"),
        },
      );
    }
  } catch (error) {
    logger.error("Error during login:", error);
    await ctx.reply(
      "❌ *Login Error*\n\n" +
        "There was an error logging into your account. Please try again later.",
      {
        parse_mode: "Markdown",
      },
    );
  }
}

async function handleStarknetAddressInput(
  ctx: BotContext,
  starknetService: StarknetService,
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
      "Starknet address is not deployed kindly deploy to make transactions.",
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
      },
    );
    return;
  }

  // Validate Starknet address (basic validation)
  if (!text.startsWith("0x") || text.length < 10) {
    await ctx.reply(
      "❌ Invalid Starknet address format. Please enter a valid address or type 'skip'.",
      {
        reply_markup: new InlineKeyboard().text("❌ Cancel", "wallet_menu"),
      },
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
    },
  );
}

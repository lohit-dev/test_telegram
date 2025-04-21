import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { logger } from "../utils/logger";

export function walletCommand(bot: Bot<BotContext>): void {
  bot.command("wallet", async (ctx) => {
    await showWalletMenu(ctx);
  });

  bot.callbackQuery("wallet_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWalletMenu(ctx);
  });

  bot.callbackQuery("create_wallets", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.step = "wallet_create";

    const confirmKeyboard = new InlineKeyboard()
      .text("✅ Create Wallets", "confirm_create_wallets")
      .row()
      .text("❌ Cancel", "wallet_menu");

    await ctx.reply(
      "🔐 *Create New Wallets*\n\n" +
        "This will generate Ethereum, Bitcoin, and Starknet wallets with random private keys.\n\n" +
        "⚠️ *IMPORTANT:* Make sure to securely save your private keys and mnemonic phrase once created.\n\n" +
        "Would you like to proceed?",
      {
        reply_markup: confirmKeyboard,
        parse_mode: "Markdown",
      }
    );
  });

  bot.callbackQuery(["import_private_key", "import_mnemonic"], async (ctx) => {
    await ctx.answerCallbackQuery();

    const importType = ctx.callbackQuery.data.includes("private_key")
      ? "private_key"
      : "mnemonic";

    console.log("Setting import type in session:", importType);

    if (!ctx.session.tempData) {
      ctx.session.tempData = {};
    }

    ctx.session.step = "select_import_chain";
    ctx.session.tempData.importType = importType;

    console.log("Session after setting import type:", {
      step: ctx.session.step,
      importType: ctx.session.tempData.importType,
    });

    const keyboard = new InlineKeyboard()
      .text("Ethereum", "import_chain_ethereum")
      .row()
      .text("Bitcoin", "import_chain_bitcoin")
      .row()
      .text("Starknet", "import_chain_starknet")
      .row()
      .text("❌ Cancel", "wallet_menu");

    const title =
      importType === "private_key"
        ? "🔑 *Import Private Key*"
        : "📝 *Import Mnemonic Phrase*";

    await ctx.reply(
      `${title}\n\n` +
        `Please select which blockchain you want to import for:`,
      {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      }
    );
  });

  // Handle blockchain selection for import
  bot.callbackQuery(/^import_chain_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const chainType = ctx.match[1];
    const importType = ctx.session.tempData?.importType;
    
    if (!importType) {
      await ctx.reply("❌ Please start the import process again.", {
        parse_mode: "Markdown",
      });
      return;
    }
    
    // For Starknet with mnemonic, show not supported message
    if (chainType === "starknet" && importType === "mnemonic") {
      await ctx.reply(
        "❌ *Starknet mnemonic import is not supported right now*\n\n" +
        "Please use private key import for Starknet wallets.",
        {
          reply_markup: new InlineKeyboard().text("🔙 Back", "wallet_menu"),
          parse_mode: "Markdown",
        }
      );
      return;
    }
    
    ctx.session.step = "wallet_import";
    if (!ctx.session.tempData) {
      ctx.session.tempData = {};
    }
    ctx.session.tempData.importChain = chainType;
    
    const keyboard = new InlineKeyboard().text("❌ Cancel", "wallet_menu");
    
    const title =
      importType === "private_key"
        ? "🔑 *Import Private Key*"
        : "📝 *Import Mnemonic Phrase*";
    
    const format =
      importType === "private_key"
        ? "Format: hex string (with or without 0x prefix)"
        : "Format: 12 or 24 word mnemonic phrase";
    
    // For Starknet, we need to ask for address as well
    if (chainType === "starknet") {
      ctx.session.step = "starknet_address_input";
      await ctx.reply(
        `${title} for Starknet\n\n` +
        `Please enter your Starknet wallet address:`,
        {
          reply_markup: keyboard,
          parse_mode: "Markdown",
        }
      );
      return;
    }
    
    await ctx.reply(
      `${title} for ${chainType.charAt(0).toUpperCase() + chainType.slice(1)}\n\n` +
      `Please enter your ${
        importType === "private_key" ? "private key" : "mnemonic phrase"
      }:\n\n` +
      `*${format}*`,
      {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      }
    );
  });
}

async function showWalletMenu(ctx: BotContext) {
  logger.info(
    "Checking wallets in session for menu:",
    JSON.stringify(ctx.session.wallets, null, 2)
  );
  const hasWallets = Object.keys(ctx.session.wallets || {}).length > 0;

  const keyboard = new InlineKeyboard()
    .text("🔑 Create New Wallets", "create_wallets")
    .row()
    .text("📥 Import Private Key", "import_private_key")
    .row()
    .text("📝 Import Mnemonic", "import_mnemonic");

  if (hasWallets) {
    keyboard.row().text("👛 View My Wallets", "list_wallets");
  }

  keyboard.row().text("🔙 Main Menu", "main_menu");

  await ctx.reply(
    "👛 *Wallet Management*\n\n" +
      "You can create new wallets or import existing ones.\n" +
      "Creating wallets will generate Ethereum, Bitcoin, and Starknet wallets.\n\n" +
      "What would you like to do?",
    {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    }
  );
}

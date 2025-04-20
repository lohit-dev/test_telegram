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
        "This will generate both an Ethereum and Bitcoin wallet with random private keys.\n\n" +
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

    ctx.session.step = "wallet_import";
    ctx.session.tempData.importType = importType;

    console.log("Session after setting import type:", {
      step: ctx.session.step,
      importType: ctx.session.tempData.importType,
    });

    const keyboard = new InlineKeyboard().text("❌ Cancel", "wallet_menu");

    const title =
      importType === "private_key"
        ? "🔑 *Import Private Key*"
        : "📝 *Import Mnemonic Phrase*";

    const format =
      importType === "private_key"
        ? "Format: hex string (with or without 0x prefix)"
        : "Format: 12 or 24 word mnemonic phrase";

    await ctx.reply(
      `${title}\n\n` +
        `Please enter your ${
          importType === "private_key" ? "private key" : "mnemonic phrase"
        } to import both Ethereum and Bitcoin wallets:\n\n` +
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
      "Creating wallets will generate both Ethereum and Bitcoin wallets.\n\n" +
      "What would you like to do?",
    {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    }
  );
}

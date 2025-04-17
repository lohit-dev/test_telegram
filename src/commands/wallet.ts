import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";

export function walletCommand(bot: Bot<BotContext>): void {
  // Wallet command - shows wallet options
  bot.command("wallet", async (ctx) => {
    await showWalletMenu(ctx);
  });

  // Handle wallet menu callback
  bot.callbackQuery("wallet_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showWalletMenu(ctx);
  });

  // Handle create wallet callback
  bot.callbackQuery(["create_eth_wallet", "create_btc_wallet"], async (ctx) => {
    await ctx.answerCallbackQuery();

    const chain =
      ctx.callbackQuery.data === "create_eth_wallet" ? "ethereum" : "bitcoin";
    ctx.session.step = "wallet_create";

    const confirmKeyboard = new InlineKeyboard()
      .text("✅ Yes, Create Wallet", `confirm_create_${chain}`)
      .text("❌ Cancel", "wallet_menu");

    await ctx.reply(
      `Are you sure you want to create a new ${
        chain === "ethereum" ? "Ethereum" : "Bitcoin"
      } wallet?\n\n` +
        "A new wallet with a random private key will be generated.\n" +
        "Make sure to securely save your private key once created.",
      {
        reply_markup: confirmKeyboard,
      }
    );
  });

  // Handle import wallet callback
  bot.callbackQuery(["import_private_key", "import_mnemonic"], async (ctx) => {
    await ctx.answerCallbackQuery();

    const importType = ctx.callbackQuery.data.includes("private_key")
      ? "private key"
      : "mnemonic";
    ctx.session.step = "wallet_import";

    const chainKeyboard = new InlineKeyboard()
      .text("Ethereum", `import_${importType}_eth`)
      .text("Bitcoin", `import_${importType}_btc`)
      .row()
      .text("❌ Cancel", "wallet_menu");

    await ctx.reply(
      `Please select which blockchain to import a wallet for using ${importType}:`,
      {
        reply_markup: chainKeyboard,
      }
    );
  });
}

// Helper function to show wallet menu
async function showWalletMenu(ctx: BotContext) {
  const hasWallets = Object.keys(ctx.session.wallets || {}).length > 0;

  const keyboard = new InlineKeyboard()
    .text("🔑 Create ETH Wallet", "create_eth_wallet")
    .text("🔑 Create BTC Wallet", "create_btc_wallet")
    .row()
    .text("📥 Import Private Key", "import_private_key")
    .text("📥 Import Mnemonic", "import_mnemonic");

  if (hasWallets) {
    keyboard.row().text("👛 My Wallets", "list_wallets");
  }

  keyboard.row().text("🔙 Back to Main Menu", "main_menu");

  await ctx.reply(
    "🪙 Wallet Management:\n\n" +
      "You can create a new wallet or import an existing one.",
    {
      reply_markup: keyboard,
    }
  );
}

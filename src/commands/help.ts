import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";

export function helpCommand(bot: Bot<BotContext>): void {
  bot.command("help", async (ctx) => {
    await showHelpMenu(ctx);
  });

  bot.callbackQuery("help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showHelpMenu(ctx);
  });
}

async function showHelpMenu(ctx: BotContext) {
  const helpText =
    "<b>🌱 GardenFi Swap Bot Help</b>\n\n" +
    "Here's how I can assist you:\n\n" +
    "<b>Commands & Features:</b>\n" +
    "    /start - Initialize or restart the bot.\n" +
    "    /wallet - Manage your cryptocurrency wallets (create/import/view).\n" +
    "    /swap - Initiate a cross-chain swap between supported assets.\n" +
    "    /help - Display this help message.\n\n" +
    "<b>Getting Started:</b>\n" +
    "1. Use the <b>Wallet</b> button (or /wallet) to create a new wallet or import an existing one.\n" +
    "2. Use the <b>Swap</b> button (or /swap) to start a swap.\n" +
    "3. Follow the prompts to select assets, enter amounts, and confirm your transaction.";

  const keyboard = new InlineKeyboard()
    .text("🪙 Wallet", "wallet_menu")
    .text("💱 Swap", "swap_menu")
    .row()
    .text("🔙 Main Menu", "main_menu");

  await ctx.reply(helpText, {
    reply_markup: keyboard,
    parse_mode: "HTML",
  });
}

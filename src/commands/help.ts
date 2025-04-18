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
    "🌿 *GardenFi Swap Bot Help*\n\n" +
    "Here's how I can assist you:\n\n" +
    "*Commands:*\n" +
    "• `/start` - Initialize or restart the bot\n" +
    "• `/wallet` - Manage your wallets\n" +
    "• `/swap` - Initiate a cross-chain swap\n" +
    "• `/help` - Display this help message\n\n" +
    "*Getting Started:*\n" +
    "1️⃣ Use *Wallet* to create a new wallet or import an existing one\n" +
    "2️⃣ Use *Swap* to start a cross-chain transaction\n" +
    "3️⃣ Follow the prompts to select assets, enter amounts, and confirm";

  const keyboard = new InlineKeyboard()
    .text("👛 Wallet", "wallet_menu")
    .text("🔄 Swap", "swap_menu")
    .row()
    .text("🔙 Main Menu", "main_menu");

  await ctx.reply(helpText, {
    reply_markup: keyboard,
    parse_mode: "Markdown",
  });
}

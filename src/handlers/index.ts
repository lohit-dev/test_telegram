import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { GardenService } from "../services/garden";
import { walletHandler } from "./handlerWallet";

export function registerHandlers(
  bot: Bot<BotContext>,
  gardenService: GardenService
): void {
  walletHandler(bot);

  bot.callbackQuery("main_menu", async (ctx) => {
    await ctx.answerCallbackQuery();

    const keyboard = new InlineKeyboard()
      .text("👛 Wallet", "wallet_menu")
      .text("🔄 Swap", "swap_menu")
      .row()
      .text("❓ Help", "help");

    await ctx.reply(
      "🌿 *GardenFi Swap Bot - Main Menu*\n\n" + 
      "What would you like to do today?",
      {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      }
    );
  });

  bot.callbackQuery("help", async (ctx) => {
    await ctx.answerCallbackQuery();

    const helpKeyboard = new InlineKeyboard()
      .text("👛 Wallet", "wallet_menu")
      .text("🔄 Swap", "swap_menu")
      .row()
      .text("🔙 Back", "main_menu");

    await ctx.reply(
      "🌿 *GardenFi Swap Bot Help*\n\n" +
      "*Available commands:*\n\n" +
      "• `/start` - Start or restart the bot\n" +
      "• `/wallet` - Manage your wallets\n" +
      "• `/swap` - Perform a cross-chain swap\n\n" +
      "*To get started:*\n" +
      "1️⃣ Create or import a wallet\n" +
      "2️⃣ Start a swap between assets\n" +
      "3️⃣ Follow the prompts to complete your swap",
      {
        reply_markup: helpKeyboard,
        parse_mode: "Markdown",
      }
    );
  });
}

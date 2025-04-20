import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";

export function startCommand(bot: Bot<BotContext>): void {
  bot.command("start", async (ctx) => {
    ctx.session = {
      step: "initial",
      wallets: {},
    };

    const keyboard = new InlineKeyboard()
      .text("👛 Wallet", "wallet_menu")
      .text("🔄 Swap", "swap_menu")
      .row()
      .text("ℹ️ Help", "help");

    await ctx.reply(
      "🌿 *Welcome to GardenFi Swap Bot!*\n\n" +
      "I can help you create or import wallets and perform cross-chain swaps using Garden.js.\n\n" +
      "• Use *Wallet* to manage your crypto wallets\n" +
      "• Use *Swap* to perform cross-chain swaps\n" +
      "• Use *Help* for more information",
      {
        reply_markup: keyboard,
        parse_mode: "Markdown",
      }
    );
  });
}

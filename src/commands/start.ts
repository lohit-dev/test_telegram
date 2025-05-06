import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { AuthHandler } from "../handlers/auth-handler";

export function registerStartCommand(bot: Bot<BotContext>): void {
  bot.command("start", async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) {
      await ctx.reply("Unable to identify user. Please try again.");
      return;
    }

    // Reset session
    ctx.session = {
      step: "initial",
      wallets: {},
    };

    // Check if user is authenticated
    const isAuthenticated = AuthHandler.isAuthenticated(telegramId);

    const keyboard = new InlineKeyboard();
    
    if (!isAuthenticated) {
      keyboard
        .text("🔑 Register", "register_account")
        .text("🔐 Login", "login_account")
        .row();
    }

    keyboard
      .text("👛 Wallet", "wallet_menu")
      .text("🔄 Swap", "swap_menu")
      .row()
      .text("ℹ️ Help", "help");

    let welcomeMessage = "🌿 *Welcome to GardenFi Swap Bot!*\n\n";
    
    if (!isAuthenticated) {
      welcomeMessage += "⚠️ *Authentication Required*\n\n" +
        "You need to register or login to use the bot's features.\n\n";
    }

    welcomeMessage += "I can help you create or import wallets and perform cross-chain swaps using Garden.js.\n\n" +
      "• Use *Wallet* to manage your crypto wallets\n" +
      "• Use *Swap* to perform cross-chain swaps\n" +
      "• Use *Help* for more information";

    await ctx.reply(welcomeMessage, {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    });
  });
}

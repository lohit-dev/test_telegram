import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { AuthHandler } from "./auth-handler";
import { DbWalletService } from "../services/db-wallet";

export function registerSwapHandlers(bot: Bot<BotContext>): void {
  // Handle swap menu button
  bot.callbackQuery("swap_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.reply("Unable to identify user. Please try again.");
      return;
    }

    // Check if user is authenticated
    if (!AuthHandler.isAuthenticated(BigInt(telegramId))) {
      const keyboard = new InlineKeyboard()
        .text("🔑 Register", "register_account")
        .row()
        .text("🔐 Login", "login_account");

      await ctx.reply(
        "⚠️ *Authentication Required*\n\n" +
          "You need to authenticate before performing swaps.\n\n" +
          "Please register or login to continue.",
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        },
      );
      return;
    }

    // Get user's wallets from database
    const password = AuthHandler.getPassword(BigInt(telegramId));
    if (!password) {
      await ctx.reply("Authentication error. Please log in again.");
      return;
    }

    const user = await AuthHandler.getUser(BigInt(telegramId));
    if (!user) {
      await ctx.reply("User not found. Please register first.");
      return;
    }

    const wallets = await DbWalletService.getUserWallets(user.id);
    if (wallets.length === 0) {
      const keyboard = new InlineKeyboard()
        .text("👛 Create Wallet", "wallet_menu")
        .row()
        .text("🔙 Main Menu", "main_menu");

      await ctx.reply(
        "⚠️ *No Wallets Found*\n\n" +
          "You need to create or import a wallet before performing swaps.",
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        },
      );
      return;
    }

    // User is authenticated and has wallets, show swap options
    const keyboard = new InlineKeyboard()
      .text("🔄 Start Swap", "select_from_asset")
      .row()
      .text("🔙 Main Menu", "main_menu");

    await ctx.reply(
      "🔄 *Swap Menu*\n\n" +
        "You have " +
        wallets.length +
        " wallet(s) available for swapping.\n\n" +
        "Click 'Start Swap' to begin a new swap transaction.",
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      },
    );
  });

  // Handle swap command
  bot.command("swap", async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) {
      await ctx.reply("Unable to identify user. Please try again.");
      return;
    }

    // Check if user is authenticated
    if (!AuthHandler.isAuthenticated(BigInt(telegramId))) {
      const keyboard = new InlineKeyboard()
        .text("🔑 Register", "register_account")
        .row()
        .text("🔐 Login", "login_account");

      await ctx.reply(
        "⚠️ *Authentication Required*\n\n" +
          "You need to authenticate before performing swaps.\n\n" +
          "Please register or login to continue.",
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        },
      );
      return;
    }

    // Get user's wallets from database
    const password = AuthHandler.getPassword(BigInt(telegramId));
    if (!password) {
      await ctx.reply("Authentication error. Please log in again.");
      return;
    }

    const user = await AuthHandler.getUser(BigInt(telegramId));
    if (!user) {
      await ctx.reply("User not found. Please register first.");
      return;
    }

    const wallets = await DbWalletService.getUserWallets(user.id);
    if (wallets.length === 0) {
      const keyboard = new InlineKeyboard()
        .text("👛 Create Wallet", "wallet_menu")
        .row()
        .text("🔙 Main Menu", "main_menu");

      await ctx.reply(
        "⚠️ *No Wallets Found*\n\n" +
          "You need to create or import a wallet before performing swaps.",
        {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        },
      );
      return;
    }

    // User is authenticated and has wallets, show swap options
    const keyboard = new InlineKeyboard()
      .text("🔄 Start Swap", "select_from_asset")
      .row()
      .text("🔙 Main Menu", "main_menu");

    await ctx.reply(
      "🔄 *Swap Menu*\n\n" +
        "You have " +
        wallets.length +
        " wallet(s) available for swapping.\n\n" +
        "Click 'Start Swap' to begin a new swap transaction.",
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      },
    );
  });
}

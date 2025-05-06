import { Bot } from "grammy";
import { BotContext } from "../types";
import { AuthHandler } from "../handlers/auth-handler";
import { InlineKeyboard } from "grammy";
import { logger } from "../utils/logger";

export function registerAuthCommands(bot: Bot<BotContext>): void {
  // Register command
  bot.command("register", async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) {
      await ctx.reply("Unable to identify user. Please try again.");
      return;
    }

    ctx.session.step = "register";
    await ctx.reply(
      "🔑 *Registration*\n\n" +
        "Please enter a password for your account.\n" +
        "This password will be used to encrypt your wallet data.",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("❌ Cancel", "main_menu"),
      },
    );
  });

  // Login command
  bot.command("login", async (ctx) => {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) {
      await ctx.reply("Unable to identify user. Please try again.");
      return;
    }

    ctx.session.step = "login";
    await ctx.reply(
      "🔐 *Login*\n\n" + "Please enter your password to access your wallets.",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("❌ Cancel", "main_menu"),
      },
    );
  });

  // Logout command
  bot.command("logout", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.reply("Unable to identify user. Please try again.");
      return;
    }

    const message = AuthHandler.logout(BigInt(telegramId));
    await ctx.reply(message);
  });

  // Handle registration callback
  bot.callbackQuery("register_account", async (ctx) => {
    logger.info("Registration callback received");
    await ctx.answerCallbackQuery("Registration started");
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      await ctx.reply("Unable to identify user. Please try again.");
      return;
    }

    // Set session step to register
    ctx.session.step = "register";
    logger.info(`Set session step to 'register' for user ${telegramId}`);

    await ctx.reply(
      "🔑 *Registration*\n\n" +
        "Please enter a password for your account.\n" +
        "This password will be used to encrypt your wallet data.",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("❌ Cancel", "main_menu"),
      },
    );
  });

  // Handle login callback
  bot.callbackQuery("login_account", async (ctx) => {
    logger.info("Login callback received");
    await ctx.answerCallbackQuery("Login started");
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) {
      await ctx.reply("Unable to identify user. Please try again.");
      return;
    }

    // Set session step to login
    ctx.session.step = "login";
    logger.info(`Set session step to 'login' for user ${telegramId}`);

    await ctx.reply(
      "🔐 *Login*\n\n" + "Please enter your password to access your wallets.",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("❌ Cancel", "main_menu"),
      },
    );
  });
}

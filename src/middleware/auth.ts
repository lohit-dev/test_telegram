import { Middleware } from "grammy";
import { BotContext } from "../types";
import { AuthHandler } from "../handlers/auth-handler";
import { InlineKeyboard } from "grammy";

export const authMiddleware: Middleware<BotContext> = async (ctx, next) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) {
    await ctx.reply("Unable to identify user. Please try again.");
    return;
  }

  // Skip auth check for registration and login commands/steps
  if (
    ctx.session.step === "register" ||
    ctx.session.step === "login" ||
    ctx.message?.text?.startsWith("/register") ||
    ctx.message?.text?.startsWith("/login") ||
    ctx.message?.text?.startsWith("/start") ||
    ctx.callbackQuery?.data === "register_account" ||
    ctx.callbackQuery?.data === "login_account"
  ) {
    return next();
  }

  // Check session flag only
  if (!ctx.session.isAuthenticated) {
    const keyboard = new InlineKeyboard()
      .text("🔑 Register", "register_account")
      .row()
      .text("🔐 Login", "login_account");

    await ctx.reply(
      "⚠️ *Authentication Required*\n\n" +
        "You need to authenticate to access this feature.",
      {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      },
    );
    return;
  }

  // User is authenticated, proceed
  return next();
};

import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { arbitrumSepolia, sepolia } from "viem/chains";

export function networkHandler(bot: Bot<BotContext>): void {
  
  bot.callbackQuery("select_network", async (ctx) => {
    await ctx.answerCallbackQuery();

    
    if (!ctx.session.wallets || Object.keys(ctx.session.wallets).length === 0) {
      const keyboard = new InlineKeyboard()
        .text("🔑 Create Wallet", "wallet_menu")
        .text("🔙 Back", "main_menu");

      await ctx.reply(
        "You need to create or import a wallet first before you can perform swaps.",
        { reply_markup: keyboard }
      );
      return;
    }

    
    const keyboard = new InlineKeyboard()
      .text("Ethereum Sepolia", "network_sepolia")
      .text("Arbitrum Sepolia", "network_arbitrum_sepolia")
      .row()
      .text("🔙 Back", "main_menu");

    await ctx.reply(
      "Select the network where you want to perform swaps:",
      { reply_markup: keyboard }
    );
  });

  
  bot.callbackQuery(["network_sepolia", "network_arbitrum_sepolia"], async (ctx) => {
    await ctx.answerCallbackQuery();

    const network = ctx.callbackQuery.data === "network_sepolia" ? sepolia : arbitrumSepolia;
    
    
    ctx.session.swapParams = {
      ...ctx.session.swapParams,
      network
    };

    
    ctx.session.step = "select_from_asset";

    const keyboard = new InlineKeyboard()
      .text("Continue Swap", "select_from_asset")
      .text("🔙 Back", "select_network");

    await ctx.reply(
      `Selected network: ${network.name}\n\n` +
      "Would you like to continue with the swap?",
      { reply_markup: keyboard }
    );
  });
} 
import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { GardenService } from "../services/garden";

export function swapCommand(
  bot: Bot<BotContext>,
  gardenService: GardenService
): void {
  // Swap command - initiates swap flow
  bot.command("swap", async (ctx) => {
    await handleSwapMenu(ctx, gardenService);
  });

  // Handle swap menu callback
  bot.callbackQuery("swap_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleSwapMenu(ctx, gardenService);
  });
}

// Helper function to handle swap menu
async function handleSwapMenu(ctx: BotContext, gardenService: GardenService) {
  const hasWallets = Object.keys(ctx.session.wallets || {}).length > 0;

  if (!hasWallets) {
    const keyboard = new InlineKeyboard()
      .text("🔑 Create Wallet", "wallet_menu")
      .text("🔙 Back to Main Menu", "main_menu");

    await ctx.reply(
      "❌ You need to create or import a wallet before swapping.\n\n" +
        "Please create or import a wallet first:",
      {
        reply_markup: keyboard,
      }
    );
    return;
  }

  // If user has wallets, show swap options
  ctx.session.step = "select_from_asset";

  try {
    // Here you would get available assets from Garden.js
    // For template, we'll use placeholder assets
    const demoAssets = [
      { chain: "ethereum", name: "ETH" },
      { chain: "bitcoin", name: "BTC" },
    ];

    const keyboard = new InlineKeyboard();
    demoAssets.forEach((asset, index) => {
      keyboard.text(`${asset.name}`, `from_asset_${index}`);
    });

    keyboard.row().text("🔙 Back", "main_menu");

    await ctx.reply("💱 Select the asset you want to swap from:", {
      reply_markup: keyboard,
    });
  } catch (error) {
    await ctx.reply("❌ Error loading assets.\n\n" + "Please try again later.");
  }
}

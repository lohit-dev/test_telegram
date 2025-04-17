
import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { WalletService } from "../services/wallet";
import { Chain } from "viem";
import { sepolia } from "viem/chains";
import { logger } from "../utils/logger";

export function walletHandler(bot: Bot<BotContext>): void {
  
  bot.callbackQuery("confirm_create_wallets", async (ctx) => {
    await ctx.answerCallbackQuery();

    try {
      await ctx.reply("Creating wallets...");

      
      const walletResponse = await WalletService.createWallets(
        sepolia as Chain
      );

      
      if (!ctx.session.wallets) ctx.session.wallets = {};

      
      ctx.session.wallets[walletResponse.ethWalletData.address] =
        walletResponse.ethWalletData;

      
      ctx.session.wallets[walletResponse.btcWalletData.address] =
        walletResponse.btcWalletData;

      
      ctx.session.activeWallet = walletResponse.ethWalletData.address;

      const keyboard = new InlineKeyboard()
        .text("💱 Start Swapping", "swap_menu")
        .text("👛 View Wallets", "list_wallets")
        .row()
        .text("🔙 Main Menu", "main_menu");

      
      let walletInfo = "✅ Wallets created successfully!\n\n";

      
      walletInfo +=
        "Ethereum Wallet:\n" +
        `Address: ${walletResponse.ethWalletData.address}\n` +
        `Private Key: ${walletResponse.ethWalletData.privateKey}\n`;

      if (walletResponse.ethWalletData.mnemonic) {
        walletInfo += `Mnemonic Phrase: ${walletResponse.ethWalletData.mnemonic}\n`;
      }

      
      walletInfo +=
        "\nBitcoin Wallet:\n" +
        `Address: ${walletResponse.btcWalletData.address}\n` +
        `Private Key: ${walletResponse.btcWalletData.privateKey}\n`;

      if (walletResponse.btcWalletData.mnemonic) {
        walletInfo += `Mnemonic Phrase: ${walletResponse.btcWalletData.mnemonic}\n`;
      }

      walletInfo +=
        "\n⚠️ IMPORTANT: Save your private keys and mnemonic phrase securely. They will not be shown again!";

      await ctx.reply(walletInfo, {
        reply_markup: keyboard,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await ctx.reply(
        `❌ Error creating wallets: ${errorMessage}\n\n` + "Please try again.",
        {
          reply_markup: new InlineKeyboard().text("🔙 Back", "wallet_menu"),
        }
      );
    }
  });

  
  bot.callbackQuery("list_wallets", async (ctx) => {
    await ctx.answerCallbackQuery();

    const wallets = ctx.session.wallets || {};
    const walletAddresses = Object.keys(wallets);

    if (walletAddresses.length === 0) {
      await ctx.reply("You don't have any wallets yet.", {
        reply_markup: new InlineKeyboard().text(
          "🔑 Create Wallets",
          "wallet_menu"
        ),
      });
      return;
    }

    let message = "Your Wallets:\n\n";

    walletAddresses.forEach((address, index) => {
      const wallet = wallets[address];
      message +=
        `${index + 1}. ${wallet.chain.toUpperCase()} Wallet\n` +
        `   Address: ${shortenAddress(address)}\n` +
        `   Connected: ${wallet.connected ? "✅" : "❌"}\n\n`;
    });

    const keyboard = new InlineKeyboard()
      .text("➕ Add Wallets", "wallet_menu")
      .text("🔙 Back", "main_menu");

    await ctx.reply(message, {
      reply_markup: keyboard,
    });
  });
}


function shortenAddress(address: string): string {
  if (!address) return "";
  return `${address.substring(0, 6)}...${address.substring(
    address.length - 4
  )}`;
}

import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { WalletService } from "../services/wallet";
import { Chain } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { escapeHTML } from "../utils/util";

export function walletHandler(bot: Bot<BotContext>): void {
  bot.callbackQuery("confirm_create_wallets", async (ctx) => {
    await ctx.answerCallbackQuery();

    try {
      await ctx.reply("<b>⏳ Creating wallets...</b>", {
        parse_mode: "HTML",
      });

      const walletResponse = await WalletService.createWallets(
        arbitrumSepolia as Chain
      );

      if (!ctx.session.wallets) ctx.session.wallets = {};

      ctx.session.wallets[walletResponse.ethWalletData.address] =
        walletResponse.ethWalletData;

      ctx.session.wallets[walletResponse.btcWalletData.address] =
        walletResponse.btcWalletData;

      ctx.session.activeWallet = walletResponse.ethWalletData.address;

      const keyboard = new InlineKeyboard()
        .text("🔄 Start Swapping", "swap_menu")
        .row()
        .text("👛 View Wallets", "list_wallets")
        .row()
        .text("🔙 Main Menu", "main_menu");

      let walletInfo = "<b>✅ Wallets Created Successfully!</b>\n\n";

      // Ethereum wallet section
      walletInfo += "<b>Ethereum Wallet:</b>\n";
      walletInfo += `• Address: <code>${escapeHTML(
        walletResponse.ethWalletData.address || ""
      )}</code>\n`;
      walletInfo += `• Private Key: <tg-spoiler>${escapeHTML(
        walletResponse.ethWalletData.privateKey || ""
      )}</tg-spoiler>\n`;

      if (walletResponse.ethWalletData.mnemonic) {
        walletInfo += `• Mnemonic: <tg-spoiler>${escapeHTML(
          walletResponse.ethWalletData.mnemonic || ""
        )}</tg-spoiler>\n`;
      }

      // Bitcoin wallet section
      walletInfo += "\n<b>Bitcoin Wallet:</b>\n";
      walletInfo += `• Address: <code>${escapeHTML(
        walletResponse.btcWalletData.address || ""
      )}</code>\n`;
      walletInfo += `• Private Key: <tg-spoiler>${escapeHTML(
        walletResponse.btcWalletData.privateKey || ""
      )}</tg-spoiler>\n`;

      if (walletResponse.btcWalletData.mnemonic) {
        walletInfo += `• Mnemonic: <tg-spoiler>${escapeHTML(
          walletResponse.btcWalletData.mnemonic || ""
        )}</tg-spoiler>\n`;
      }

      walletInfo +=
        "\n<b>⚠️ IMPORTANT:</b> Save your private keys and mnemonic phrase securely. They will not be shown again!";
      await ctx.reply(walletInfo, {
        reply_markup: keyboard,
        parse_mode: "HTML",
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await ctx.reply(
        "<b>❌ Error Creating Wallets</b>\n\n" +
        `Error details: ${escapeHTML(errorMessage)}\n\n` +
        "Please try again.",
        {
          reply_markup: new InlineKeyboard().text("🔙 Back", "wallet_menu"),
          parse_mode: "HTML",
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

    let message = "👛 *Your Wallets*\n\n";

    walletAddresses.forEach((address, index) => {
      const wallet = wallets[address];
      message +=
        `*${index + 1}. ${wallet.chain.toUpperCase()} Wallet*\n` +
        `• Address: \`${shortenAddress(address)}\`\n` +
        `• Status: ${wallet.connected ? "✅ Connected" : "❌ Not Connected"
        }\n\n`;
    });

    const keyboard = new InlineKeyboard()
      .text("➕ Add Wallets", "wallet_menu")
      .row()
      .text("🔙 Main Menu", "main_menu");

    await ctx.reply(message, {
      reply_markup: keyboard,
      parse_mode: "Markdown",
    });
  });
}

function shortenAddress(address: string): string {
  if (!address) return "";
  return `${address.substring(0, 6)}...${address.substring(
    address.length - 4
  )}`;
}

// src/handlers/walletHandler.ts
import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { WalletService } from "../services/wallet";
import { Chain } from "viem";

export function walletHandler(bot: Bot<BotContext>): void {
  // Handle wallet creation confirmation
  bot.callbackQuery(
    ["confirm_create_ethereum", "confirm_create_bitcoin"],
    async (ctx) => {
      await ctx.answerCallbackQuery();

      const chain = ctx.callbackQuery.data.includes("ethereum")
        ? "ethereum"
        : "bitcoin";

      try {
        await ctx.reply(`Creating ${chain} wallet...`);

        const walletResponse = await WalletService.createWallets(chain as unknown as Chain);
        const wallet = chain === "ethereum" ? walletResponse.ethWalletData : walletResponse.btcWalletData;

        if (!ctx.session.wallets) ctx.session.wallets = {};
        ctx.session.wallets[wallet.address] = wallet;
        ctx.session.activeWallet = wallet.address;

        const keyboard = new InlineKeyboard()
          .text("🔄 Create Another Wallet", "wallet_menu")
          .text("💱 Start Swapping", "swap_menu")
          .row()
          .text("🔙 Main Menu", "main_menu");

        // Display wallet info - include mnemonic if available
        let walletInfo =
          `✅ ${
            chain.charAt(0).toUpperCase() + chain.slice(1)
          } wallet created successfully!\n\n` +
          `Address: ${wallet.address}\n` +
          `Private Key: ${wallet.privateKey || "Not available"}\n`;

        if (wallet.mnemonic) {
          walletInfo += `\nMnemonic Phrase: ${wallet.mnemonic}\n`;
        }

        walletInfo +=
          "\n⚠️ IMPORTANT: Save your private key and mnemonic phrase securely. They will not be shown again!";

        await ctx.reply(walletInfo, {
          reply_markup: keyboard,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        await ctx.reply(
          `❌ Error creating wallet: ${errorMessage}\n\n` + "Please try again.",
          {
            reply_markup: new InlineKeyboard().text("🔙 Back", "wallet_menu"),
          }
        );
      }
    }
  );

  // Handle wallet import type selection
  bot.callbackQuery(
    [
      "import_private_key_eth",
      "import_private_key_btc",
      "import_mnemonic_eth",
      "import_mnemonic_btc",
    ],
    async (ctx) => {
      await ctx.answerCallbackQuery();

      const data = ctx.callbackQuery.data;
      const isPrivateKey = data.includes("private_key");
      const chain = data.includes("_eth") ? "ethereum" : "bitcoin";

      ctx.session.tempData = {
        ...ctx.session.tempData,
      };

      await ctx.reply(
        `Please enter your ${
          isPrivateKey ? "private key" : "mnemonic phrase"
        } for ${chain}:\n\n` +
          `${
            isPrivateKey
              ? "Format: hex string (with or without 0x prefix)"
              : "Format: 12 or 24 word mnemonic phrase"
          }`
      );

      // Store import type in session for message handler
      ctx.session.step = "wallet_import";
      ctx.session.tempData = {
        ...ctx.session.tempData,
        importType: isPrivateKey ? "private_key" : "mnemonic",
        importChain: chain as unknown as Chain,
      };
    }
  );

  // Handle wallet listing
  bot.callbackQuery("list_wallets", async (ctx) => {
    await ctx.answerCallbackQuery();

    const wallets = ctx.session.wallets || {};
    const walletAddresses = Object.keys(wallets);

    if (walletAddresses.length === 0) {
      await ctx.reply("You don't have any wallets yet.", {
        reply_markup: new InlineKeyboard().text(
          "🔑 Create Wallet",
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
      .text("➕ Add Wallet", "wallet_menu")
      .text("🔙 Back", "main_menu");

    await ctx.reply(message, {
      reply_markup: keyboard,
    });
  });

  // Handle text messages for wallet import
  bot.on("message:text", async (ctx) => {
    if (ctx.session.step !== "wallet_import") return;

    const text = ctx.message.text.trim();

    // Check if we're expecting a private key or mnemonic
    if (
      !ctx.session.tempData?.importType ||
      !ctx.session.tempData?.importChain
    ) {
      await ctx.reply("Please start the import process again.");
      return;
    }

    const isPrivateKey = ctx.session.tempData.importType === "private_key";
    const chain = ctx.session.tempData.importChain;

    try {
      let wallet;

      if (isPrivateKey) {
        // Import from private key
        wallet = await WalletService.importFromPrivateKey(text, chain);
      } else {
        // Import from mnemonic
        wallet = await WalletService.importFromMnemonic(text, chain);
      }

      // Store wallet in session
      if (!ctx.session.wallets) ctx.session.wallets = {};
      ctx.session.wallets[wallet.address] = wallet;
      ctx.session.activeWallet = wallet.address;

      // Clear sensitive data from temp storage
      ctx.session.tempData = {};
      ctx.session.step = "wallet_imported";

      const keyboard = new InlineKeyboard()
        .text("💱 Start Swapping", "swap_menu")
        .text("👛 View Wallets", "list_wallets")
        .row()
        .text("🔙 Main Menu", "main_menu");

      await ctx.reply(
        `✅ wallet imported successfully!\n\n` +
          `Address: ${wallet.address}\n\n` +
          "What would you like to do next?",
        {
          reply_markup: keyboard,
        }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      await ctx.reply(
        `❌ Error importing wallet: ${errorMessage}\n\n` +
          "Please check your input and try again.",
        {
          reply_markup: new InlineKeyboard().text("🔙 Back", "wallet_menu"),
        }
      );
    }
  });
}

// Helper function to shorten addresses
function shortenAddress(address: string): string {
  if (!address) return "";
  return `${address.substring(0, 6)}...${address.substring(
    address.length - 4
  )}`;
}

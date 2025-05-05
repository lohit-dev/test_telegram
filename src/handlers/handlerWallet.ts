import { Bot, InlineKeyboard } from "grammy";
import { BotContext } from "../types";
import { WalletService } from "../services/wallet";
import { Chain } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { escapeHTML, shortenAddress } from "../utils/util";
import { StarknetService } from "../services/starknet";
import { logger } from "../utils/logger";

export function walletHandler(
  bot: Bot<BotContext>,
  starknetService: StarknetService
): void {
  bot.callbackQuery("confirm_create_wallets", async (ctx) => {
    await ctx.answerCallbackQuery();

    try {
      await ctx.reply("<b>⏳ Creating wallets...</b>", {
        parse_mode: "HTML",
      });

      const walletResponse = await WalletService.createWallets(
        arbitrumSepolia as Chain,
        starknetService
      );

      if (!ctx.session.wallets) ctx.session.wallets = {};

      ctx.session.wallets[walletResponse.ethWalletData.address] =
        walletResponse.ethWalletData;

      ctx.session.wallets[walletResponse.btcWalletData.address] =
        walletResponse.btcWalletData;

      // Save Starknet wallet to session if it exists
      if (walletResponse.starknetWalletData) {
        ctx.session.wallets[walletResponse.starknetWalletData.address] =
          walletResponse.starknetWalletData;
      }

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

      // Starknet wallet section
      if (walletResponse.starknetWalletData) {
        walletInfo += "\n<b>Starknet Wallet:</b>\n";
        walletInfo += `• Address: <code>${escapeHTML(
          walletResponse.starknetWalletData.address || ""
        )}</code>\n`;
        walletInfo += `• Private Key: <tg-spoiler>${escapeHTML(
          walletResponse.starknetWalletData.privateKey || ""
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
        `• Status: ${
          wallet.connected ? "✅ Connected" : "❌ Not Connected"
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

  // Add the select_chain callback here
  bot.callbackQuery(/^select_chain\|(.+)\|(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();

    const chainType = ctx.match[1]; // bitcoin, ethereum, or starknet
    const importType = ctx.match[2]; // private_key or mnemonic

    if (!ctx.session.tempData) {
      ctx.session.tempData = {};
    }

    ctx.session.tempData.importType = importType;
    ctx.session.tempData.importChain = chainType;

    // For Starknet, we need to ask for the address first
    if (chainType === "starknet") {
      ctx.session.step = "enter_starknet_address";
      const keyboard = new InlineKeyboard().text("❌ Cancel", "wallet_menu");
      await ctx.reply(
        "🌟 *Starknet Address Required*\n\n" +
          "Please enter your Starknet wallet address to continue with the import process.\n\n" +
          "If you don't have a Starknet address, type 'skip' to continue without Starknet integration.",
        {
          reply_markup: keyboard,
          parse_mode: "Markdown",
        }
      );
    } else {
      // For Bitcoin and Ethereum, go directly to import
      ctx.session.step = "wallet_import";
      const title =
        importType === "private_key"
          ? "🔑 Import Private Key"
          : "📝 Import Mnemonic Phrase";
      const format =
        importType === "private_key"
          ? "Format: hex string (with or without 0x prefix)"
          : "Format: 12 or 24 word mnemonic phrase";
      const keyboard = new InlineKeyboard().text("❌ Cancel", "wallet_menu");
      await ctx.reply(
        `${title}\n\n` +
          `Please enter your ${
            importType === "private_key" ? "private key" : "mnemonic phrase"
          } ` +
          `to import your ${
            chainType.charAt(0).toUpperCase() + chainType.slice(1)
          } wallet:\n\n` +
          `*${format}*`,
        {
          reply_markup: keyboard,
          parse_mode: "Markdown",
        }
      );
    }
  });

  // bot.callbackQuery("deploy_starknet_contract", async (ctx) => {
  //   await ctx.answerCallbackQuery();

  //   try {
  //     const activeWalletAddress = ctx.session.activeWallet;
  //     if (!activeWalletAddress || !ctx.session.wallets?.[activeWalletAddress]) {
  //       await ctx.reply(
  //         "❌ No active wallet found. Please import a wallet first."
  //       );
  //       return;
  //     }

  //     const wallet = ctx.session.wallets[activeWalletAddress];

  //     if (wallet.chain !== "starknet") {
  //       await ctx.reply(
  //         "❌ The active wallet is not a Starknet wallet. Please select a Starknet wallet first."
  //       );
  //       return;
  //     }

  //     if (!wallet.privateKey) {
  //       await ctx.reply(
  //         "❌ Private key not found for this wallet. Please reimport the wallet."
  //       );
  //       return;
  //     }

  //     await ctx.reply(
  //       "⏳ *Deploying Starknet Contract...*\n\nThis may take a few moments. Please wait.",
  //       {
  //         parse_mode: "Markdown",
  //       }
  //     );

  //     const result = await starknetService.deployContract(
  //       wallet.address,
  //       wallet.privateKey
  //     );

  //     if (result.success) {
  //       wallet.contractDeployed = true;
  //       ctx.session.wallets[activeWalletAddress] = wallet;

  //       const keyboard = new InlineKeyboard()
  //         .text("🔄 Start Swapping", "swap_menu")
  //         .row()
  //         .text("👛 View Wallets", "list_wallets")
  //         .row()
  //         .text("🔙 Main Menu", "main_menu");

  //       await ctx.reply(
  //         "✅ *Contract Deployed Successfully!*\n\n" +
  //           `Contract Address: \`${result.contractAddress}\`\n` +
  //           `Transaction Hash: \`${result.transactionHash}\`\n\n` +
  //           "Your wallet is now ready to make transactions.",
  //         {
  //           reply_markup: keyboard,
  //           parse_mode: "Markdown",
  //         }
  //       );
  //     } else {
  //       await ctx.reply(
  //         "❌ *Contract Deployment Failed*\n\n" +
  //           "There was an error deploying your contract. Please make sure you have enough funds in your wallet and try again.\n\n" +
  //           `Error details: ${result.error || "Unknown error"}`,
  //         {
  //           reply_markup: new InlineKeyboard().text("🔙 Back", "wallet_menu"),
  //           parse_mode: "Markdown",
  //         }
  //       );
  //     }
  //   } catch (error) {
  //     logger.error("Error deploying contract:", error);
  //     const errorMessage =
  //       error instanceof Error ? error.message : "Unknown error";

  //     await ctx.reply(
  //       "❌ *Error Deploying Contract*\n\n" +
  //         `Error details: ${errorMessage}\n\n` +
  //         "Please make sure you have enough funds in your wallet and try again.",
  //       {
  //         reply_markup: new InlineKeyboard().text("🔙 Back", "wallet_menu"),
  //         parse_mode: "Markdown",
  //       }
  //     );
  //   }
  // });
}

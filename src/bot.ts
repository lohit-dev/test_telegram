import { Bot, session } from "grammy";
import { BotContext } from "./types";
import { config } from "./config";
import { registerCommands } from "./commands";
import { registerHandlers } from "./handlers";
import { logger } from "./utils/logger";
import { GardenService } from "./services/garden";
import { handleTextMessages } from "./handlers/textMessageHandler";

export async function initBot() {
  try {
    const bot = new Bot<BotContext>(config.BOT_TOKEN);

    bot.use(
      session({
        initial: () => ({
          step: "initial" as
            | "initial"
            | "wallet_create"
            | "wallet_import"
            | "wallet_imported"
            | "select_network"
            | "select_from_asset"
            | "select_to_asset"
            | "swap_amount"
            | "enter_destination"
            | "confirm_swap",
          wallets: {},
        }),
      })
    );

    bot.use(async (ctx, next) => {
      const update = ctx.update;
      logger.info(`Received update: ${JSON.stringify(update)}`);
      await next();
    });

    const gardenService = new GardenService(bot);

    registerCommands(bot, gardenService);
    registerHandlers(bot, gardenService);
    handleTextMessages(bot, gardenService);

    bot.catch((err) => {
      logger.error("Bot error:", err);
    });

    return bot;
  } catch (error) {
    logger.error("Error initializing bot:", error);
    throw error;
  }
}

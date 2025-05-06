import { Bot, session } from "grammy";
import { BotContext, StepType } from "./types";
import { config } from "./config";
import { registerCommands } from "./commands";
import { registerHandlers } from "./handlers";
import { logger } from "./utils/logger";
import { GardenService } from "./services/garden";
import { handleTextMessages } from "./handlers/textMessageHandler";
import { StarknetService } from "./services/starknet";
import { authMiddleware } from "./middleware/auth";

export async function initBot() {
  try {
    const bot = new Bot<BotContext>(config.BOT_TOKEN);

    bot.use(
      session({
        initial: () => ({
          step: "initial" as StepType,
          wallets: {},
        }),
      }),
    );

    bot.use(async (ctx, next) => {
      const update = ctx.update;
      logger.info(`Received update: ${JSON.stringify(update)}`);
      await next();
    });

    bot.use(authMiddleware);

    const gardenService = new GardenService(bot);
    const starknetService = new StarknetService();

    registerCommands(bot, gardenService);
    registerHandlers(bot, starknetService);
    handleTextMessages(bot, starknetService);

    bot.catch((err) => {
      logger.error("Bot error:", err);
    });

    return bot;
  } catch (error) {
    logger.error("Error initializing bot:", error);
    throw error;
  }
}

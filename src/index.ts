import { initBot } from "./bot";
import { logger } from "./utils/logger";

async function startBot() {
  try {
    const bot = await initBot();

    await bot.start({
      onStart: (botInfo) => {
        logger.info(`Bot @${botInfo.username} started!`);
      },
    });
  } catch (error) {
    logger.error("Failed to start bot:", error);
    process.exit(1);
  }
}

startBot();

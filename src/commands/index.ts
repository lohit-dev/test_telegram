import { Bot } from "grammy";
import { BotContext } from "../types";
import { GardenService } from "../services/garden";
import { registerStartCommand } from "./start";
import { walletCommand } from "./wallet";
import { swapCommand } from "./swap";
import { helpCommand } from "./help";
import { registerAuthCommands } from "./auth";

export function registerCommands(
  bot: Bot<BotContext>,
  gardenService: GardenService,
): void {
  registerStartCommand(bot);
  registerAuthCommands(bot);
  walletCommand(bot);
  swapCommand(bot, gardenService);
  helpCommand(bot);
}

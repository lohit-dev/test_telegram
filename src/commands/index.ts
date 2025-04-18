import { Bot } from "grammy";
import { BotContext } from "../types";
import { GardenService } from "../services/garden";
import { startCommand } from "./start";
import { walletCommand } from "./wallet";
import { swapCommand } from "./swap";
import { helpCommand } from "./help";

export function registerCommands(
  bot: Bot<BotContext>,
  gardenService: GardenService
): void {
  startCommand(bot);
  walletCommand(bot);
  swapCommand(bot, gardenService);
  helpCommand(bot);
}

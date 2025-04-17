import dotenv from "dotenv";
dotenv.config();

export const config = {
  BOT_TOKEN: process.env.BOT_TOKEN || "",
  GARDEN_API_KEY: process.env.GARDEN_API_KEY || "",
  ENVIRONMENT: (process.env.ENVIRONMENT || "testnet").toLowerCase(),
  LOG_LEVEL: process.env.LOG_LEVEL || "info"
};

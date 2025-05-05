import dotenv from "dotenv";
dotenv.config();

export const config = {
  BOT_TOKEN: process.env.BOT_TOKEN || "",
  GARDEN_API_KEY: process.env.GARDEN_API_KEY || "",
  ENVIRONMENT: (process.env.ENVIRONMENT || "testnet").toLowerCase(),
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  STARKNET_ACCOUNT_CLASS_HASH:
    process.env.STARKNET_ACCOUNT_CLASS_HASH ||
    "0x05b4b537eaa2399e3aa99c4e2e0208ebd6c71bc1467938cd52c798c601e43564",
};

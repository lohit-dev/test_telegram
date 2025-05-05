import {
  Account,
  constants,
  ec,
  json,
  stark,
  RpcProvider,
  hash,
  CallData,
  ProviderInterface,
  ContractFactory,
} from "starknet";

import { getAccountFromPk, getStarkPk } from "../utils/util";
import { logger } from "../utils/logger";
import { config } from "../config";

export class StarknetService {
  provider: RpcProvider;

  constructor() {
    this.provider = new RpcProvider();
  }

  /**
   * Create a OZ Starknet wallet
   * @returns Object containing the wallet and address
   */
  createWallet() {
    const privateKey = stark.randomAddress();
    logger.info("New OZ account:\nprivateKey=", privateKey);
    const starkKeyPub = ec.starkCurve.getStarkKey(privateKey);
    logger.info("publicKey=", starkKeyPub);
    const OZaccountClassHash = config.STARKNET_ACCOUNT_CLASS_HASH;

    // To Calculate the future addresss
    const OZaccountConstructorCallData = CallData.compile({
      publicKey: starkKeyPub,
    });

    const OZcontractAddress = hash.calculateContractAddressFromHash(
      starkKeyPub,
      OZaccountClassHash,
      OZaccountConstructorCallData,
      0
    );

    const account = new Account(
      this.provider,
      OZcontractAddress,
      privateKey,
      "1"
    );

    return {
      account,
      address: account.address,
      privateKey: privateKey,
      publicKey: starkKeyPub,
    };
  }

  /**
   * Import a Starknet wallet from a private key
   * @param privateKey The private key to import
   * @returns Object containing the wallet and address
   */
  importFromPrivateKey(privateKey: string, address: string) {
    const account = new Account(this.provider, address, privateKey, "1");

    return {
      account,
      address: address,
      privateKey: privateKey,
    };
  }

  importFromMnemonic(mnemonic: string, index: number = 0, address: string) {
    const starkPk = getStarkPk(mnemonic, index);
    const account = getAccountFromMnemonic(
      address,
      mnemonic,
      index,
      this.provider,
      3
    );

    logger.info("Importing wallet from mnemonic");
    logger.info("The private key is: " + starkPk);
    logger.info("The address is: " + address);
    logger.info("The account is: " + account.address);

    return {
      account,
      address: account.address,
      privateKey: starkPk,
    };
  }

  async checkContractExists(address: string) {
    try {
      const classHash = await this.provider.getClassHashAt(address);
      logger.info("Contract exists at this address");
      return true;
    } catch (error) {
      logger.info("No contract found at this address");
      return false;
    }
  }

  getProvider() {
    return this.provider;
  }
}

export function getAccountFromMnemonic(
  address: string,
  mnemonic: string,
  index: number = 0,
  provider: ProviderInterface,
  txVersion = 2
): Account {
  const starkPk = getStarkPk(mnemonic, index);
  return getAccountFromPk(address, starkPk, provider, txVersion);
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection:", reason);
  // Don't exit process here
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // Don't exit process here
});

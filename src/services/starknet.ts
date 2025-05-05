import {
  Account,
  ec,
  stark,
  RpcProvider,
  hash,
  CallData,
  ProviderInterface,
} from "starknet";
import { getAccountFromPk, getStarkPk } from "../utils/util";
import { logger } from "../utils/logger";
import { config } from "../config";
import { with0x } from "@gardenfi/utils";

export class StarknetService {
  provider: RpcProvider;

  constructor(nodeUrl?: string) {
    this.provider = new RpcProvider({
      nodeUrl:
        nodeUrl || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7",
    });
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

    const formattedPrivateKey = privateKey.startsWith("0x")
      ? privateKey
      : with0x(privateKey);

    const account = new Account(
      this.provider,
      OZcontractAddress,
      formattedPrivateKey,
      "1"
    );

    return {
      account,
      address: account.address,
      privateKey: formattedPrivateKey,
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

  async deployContract(address: string, privateKey: string) {
    try {
      const OZaccount = new Account(
        this.provider,
        address,
        privateKey,
        "1",
        "0x3"
      );
      const starkKeyPub = ec.starkCurve.getStarkKey(privateKey);

      const OZaccountConstructorCallData = CallData.compile({
        publicKey: starkKeyPub,
      });

      const { transaction_hash, contract_address } =
        await OZaccount.deployAccount({
          classHash: config.STARKNET_ACCOUNT_CLASS_HASH,
          constructorCalldata: OZaccountConstructorCallData,
          addressSalt: starkKeyPub,
        });

      await this.provider.waitForTransaction(transaction_hash);
      console.log(
        "✅ New OpenZeppelin account created.\n   address =",
        contract_address
      );

      return {
        success: true,
        contractAddress: contract_address,
        transactionHash: transaction_hash,
      };
    } catch (error) {
      logger.error("Error deploying contract:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
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

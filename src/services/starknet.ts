import { Account, ProviderInterface, RpcProvider } from "starknet";
import { getAccountFromPk, getStarkPk } from "../utils/util";
import { logger } from "../utils/logger";

export class StarknetService {
    provider: RpcProvider;

    constructor(provider: RpcProvider) {
        this.provider = provider;
    }

    /**
    * Import a Starknet wallet from a private key
    * @param privateKey The private key to import
    * @returns Object containing the wallet and address
   */
    importFromPrivateKey(privateKey: string, address: string) {
        const account = new Account(this.provider, address, privateKey, "1", "0x3");

        return {
            account,
            address: address,
            privateKey: privateKey,
        };
    }


    // static fromMnemonic(
    //     mnemonic: string,
    //     index: number = 0,
    //     provider: ProviderInterface,
    //     address?: string,
    //     accountClassHash?: string,
    //     txVersion = 2,
    //   ): StarkNetWallet {
    //     if (address == undefined && accountClassHash != undefined) {
    //       address = StarkNetWallet.computeAddressFromMnemonic(mnemonic, accountClassHash, index);
    //     }
    //     if (address == undefined) {
    //       console.log("Either address or contract class must be provided");
    //       process.exit(1);
    //     }
    //     const starkPk = getStarkPk(mnemonic, index);
    //     let newWallet = new StarkNetWallet(starkPk, provider, address);
    //     let account = StarkNetWallet.getAccountFromMnemonic(address, mnemonic, index, provider, txVersion);
    //     newWallet.account = account;
    //     return newWallet;
    //   }

    importFromMnemonic(mnemonic: string, index: number = 0, address: string) {

        const starkPk = getStarkPk(mnemonic, index);
        const account = getAccountFromMnemonic(address, mnemonic, index, this.provider, 3);

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
}

export function getAccountFromMnemonic(
    address: string,
    mnemonic: string,
    index: number = 0,
    provider: ProviderInterface,
    txVersion = 2,
): Account {
    const starkPk = getStarkPk(mnemonic, index);
    return getAccountFromPk(address, starkPk, provider, txVersion);
}

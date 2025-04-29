import { Account, ProviderInterface, RpcProvider } from "starknet";
import { getAccountFromPk, getStarkPk } from "../utils/util";
import { logger } from "../utils/logger";

export class StarknetService {
    provider: RpcProvider;

    constructor() {
        this.provider = new RpcProvider();
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

    getProvider() {
        return this.provider;
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

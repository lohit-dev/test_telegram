import { Account, RpcProvider, stark, ec } from "starknet";

export class StarknetService {
  provider: RpcProvider;

  constructor(nodeUrl?: string) {
    this.provider = new RpcProvider({
      nodeUrl:
        nodeUrl || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7",
    });
  }

  /**
   * Creates a new random Starknet wallet
   * @returns Object containing the wallet, private key, and address
   */
  createNewWallet() {
    // Generate a random private key
    // const address = stark.randomAddress();
    const privateKey = ec.starkCurve.utils.randomPrivateKey();

    // Derive the public key from the private key
    const publicKey = ec.starkCurve.getStarkKey(privateKey);

    // Create an account with the correct parameters
    const account = new Account(
      this.provider,
      publicKey,
      privateKey,
      "1",
      "0x3"
    );

    return {
      account,
      address: publicKey,
      privateKey: privateKey,
    };
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

  /**
   * Import a Starknet wallet from a mnemonic phrase
   * @param mnemonic The mnemonic phrase to import (12 or 24 words)
   * @param index Optional derivation path index (default: 0)
   * @returns Object containing the wallet, private key, and address
   */
  importFromMnemonic(mnemonic: string, index: number = 0) {
    // Note: This implementation requires the bip39 package
    // You would need to install it: npm install bip39
    // And import it: import * as bip39 from 'bip39';

    // This is a simplified implementation, proper BIP39 implementation would be more involved
    const seed = `${mnemonic}_${index}`;
    const privateKey = ec.starkCurve.grindKey(seed);

    // Derive the public key from the private key
    const publicKey = ec.starkCurve.getStarkKey(privateKey);

    // Create an account with the correct parameters
    const account = new Account(
      this.provider,
      publicKey,
      privateKey,
      "1",
      "0x3"
    );

    return {
      account,
      address: publicKey,
      privateKey: privateKey,
    };
  }
}

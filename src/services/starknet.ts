import { Account, RpcProvider, stark, ec } from "starknet";

export class StarknetService {
  provider: RpcProvider;

  constructor() {
    this.provider = new RpcProvider();
  }

  /**
   * Creates a new random Starknet wallet
   * @returns Object containing the wallet, private key, and address
   */
  createNewWallet() {
    // Generate a new private key
    const privateKey = stark.randomAddress();
    // Calculate the public key from the private key
    const publicKey = ec.starkCurve.getStarkKey(privateKey);
    // Create an Account object
    const account = new Account(this.provider, publicKey, privateKey);

    return {
      account,
      address: publicKey,
      privateKey,
    };
  }

  /**
   * Import a Starknet wallet from a private key
   * @param privateKey The private key to import
   * @returns Object containing the wallet, private key, and address
   */
  importFromPrivateKey(privateKey: string) {
    // If private key starts with "0x", remove it for consistency
    const cleanPrivateKey = privateKey.startsWith("0x")
      ? privateKey.slice(2)
      : privateKey;

    // Calculate the public key from the private key
    const publicKey = ec.starkCurve.getStarkKey(cleanPrivateKey);

    // Create an Account object
    const account = new Account(this.provider, publicKey, cleanPrivateKey);

    return {
      account,
      address: publicKey,
      privateKey: cleanPrivateKey,
    };
  }

  //   /**
  //    * Import a Starknet wallet from a mnemonic phrase
  //    * @param mnemonic The mnemonic phrase to import (12 or 24 words)
  //    * @param index Optional derivation path index (default: 0)
  //    * @returns Object containing the wallet, private key, and address
  //    */
  //   importFromMnemonic(mnemonic: string, index: number = 0) {
  //     const words = mnemonic.trim().split(/\s+/);
  //     if (words.length !== 12 && words.length !== 24) {
  //       throw new Error("Invalid mnemonic format. Must be 12 or 24 words.");
  //     }

  //     const privateKey = ec.starkCurve
  //       .keccak(Buffer.from(mnemonic + index.toString()))
  //       .toString("hex");

  //     // Calculate the public key from the private key
  //     const publicKey = ec.starkCurve.getStarkKey(privateKey);

  //     // Create an Account object
  //     const account = new Account(this.provider, publicKey, privateKey);

  //     return {
  //       account,
  //       address: publicKey,
  //       privateKey,
  //     };
  //   }
}

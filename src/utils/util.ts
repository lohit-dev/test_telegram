import { ethers } from "ethers";
import { getStarkKey, grindKey } from "@scure/starknet";
import { Account, ProviderInterface } from "starknet";

export function escapeHTML(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const baseDerivationPath = "m/44'/9004'/0'/0";

export function getStarkPk(mnemonic: string, index: number): string {
  const fullPath = getPathForIndex(index, baseDerivationPath);
  const masterNode = ethers.HDNodeWallet.fromPhrase(
    mnemonic,
    undefined,
    fullPath
  );
  const groundKey = grindKey(masterNode.privateKey);

  return getStarkKey(groundKey);
}

export function getPubKey(pk: string): string {
  return getStarkKey(pk);
}

export function getPathForIndex(
  index: number,
  baseDerivationPath: string
): string {
  return `${baseDerivationPath}/${index}`;
}

export function getAccountFromPk(
  address: string,
  pk: string,
  provider: ProviderInterface,
  txVersion = 2
): Account {
  if (txVersion == 2) {
    return new Account(provider, address, pk, "1");
  } else if (txVersion == 3) {
    return new Account(provider, address, pk, "1");
  } else {
    console.log("Unsupported account version");
    process.exit(0);
  }
}

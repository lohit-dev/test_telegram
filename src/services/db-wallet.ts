import { EncryptionService } from '../utils/encryption';
import { WalletData } from '../types';
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DbWalletService {
  /**
   * Save a wallet to the database with encryption
   * @param userId User ID
   * @param walletData Wallet data to save
   * @param password User's password for encryption
   * @returns The saved wallet
   */
  static async saveWallet(userId: number, walletData: WalletData, password: string) {
    try {
      // Encrypt sensitive data
      const encryptedKey = walletData.privateKey 
        ? EncryptionService.encrypt(walletData.privateKey, password)
        : '';
      
      const encryptedMnemonic = walletData.mnemonic
        ? EncryptionService.encrypt(walletData.mnemonic, password)
        : null;
      
      // Save to database
      const wallet = await prisma.wallet.create({
        data: {
          userId,
          address: walletData.address,
          encryptedKey,
          encryptedMnemonic,
          chain: walletData.chain,
          type: walletData.chain.toUpperCase(), // ETH, BTC, STARK
          publicKey: walletData.publicKey || null,
          isActive: true,
        },
      });
      
      return wallet;
    } catch (error) {
      logger.error('Error saving wallet to database:', error);
      throw error;
    }
  }
  
  /**
   * Get a wallet from the database and decrypt it
   * @param userId User ID
   * @param walletId Wallet ID
   * @param password User's password for decryption
   * @returns Decrypted wallet data
   */
  static async getWallet(userId: number, walletId: number, password: string) {
    try {
      // Get the wallet from the database
      const wallet = await prisma.wallet.findFirst({
        where: {
          id: walletId,
          userId,
        },
      });
      
      if (!wallet) {
        throw new Error('Wallet not found');
      }
      
      // Decrypt the sensitive data
      const privateKey = wallet.encryptedKey 
        ? EncryptionService.decrypt(wallet.encryptedKey, password)
        : undefined;
      
      const mnemonic = wallet.encryptedMnemonic
        ? EncryptionService.decrypt(wallet.encryptedMnemonic, password)
        : undefined;
      
      // Return as WalletData
      return {
        address: wallet.address,
        privateKey,
        mnemonic,
        publicKey: wallet.publicKey || undefined,
        chain: wallet.chain,
        connected: true,
      };
    } catch (error) {
      logger.error('Error getting wallet from database:', error);
      throw error;
    }
  }
  
  /**
   * Get all wallets for a user
   * @param userId User ID
   * @returns List of wallet data (without decrypted keys)
   */
  static async getUserWallets(userId: number) {
    try {
      const wallets = await prisma.wallet.findMany({
        where: { userId },
      });
      
      // Return basic info without decrypted keys
      return wallets.map((wallet: any) => ({
        id: wallet.id,
        address: wallet.address,
        chain: wallet.chain,
        type: wallet.type,
        hasPrivateKey: !!wallet.encryptedKey,
        hasMnemonic: !!wallet.encryptedMnemonic,
        publicKey: wallet.publicKey || undefined,
        isActive: wallet.isActive,
      }));
    } catch (error) {
      logger.error('Error getting user wallets:', error);
      throw error;
    }
  }
  
  /**
   * Re-encrypt a user's wallets with a new password
   * @param userId User ID
   * @param oldPassword Old password
   * @param newPassword New password
   * @returns True if successful
   */
  static async reencryptWallets(userId: number, oldPassword: string, newPassword: string) {
    try {
      // Get all wallets for the user
      const wallets = await prisma.wallet.findMany({
        where: { userId },
      });
      
      // Re-encrypt each wallet
      for (const wallet of wallets) {
        // Decrypt with old password
        let privateKey = undefined;
        let mnemonic = undefined;
        
        if (wallet.encryptedKey) {
          privateKey = EncryptionService.decrypt(wallet.encryptedKey, oldPassword);
        }
        
        if (wallet.encryptedMnemonic) {
          mnemonic = EncryptionService.decrypt(wallet.encryptedMnemonic, oldPassword);
        }
        
        // Re-encrypt with new password
        const newEncryptedKey = privateKey 
          ? EncryptionService.encrypt(privateKey, newPassword)
          : wallet.encryptedKey;
        
        const newEncryptedMnemonic = mnemonic
          ? EncryptionService.encrypt(mnemonic, newPassword)
          : wallet.encryptedMnemonic;
        
        // Update in database
        await prisma.wallet.update({
          where: { id: wallet.id },
          data: {
            encryptedKey: newEncryptedKey,
            encryptedMnemonic: newEncryptedMnemonic,
          },
        });
      }
      
      return true;
    } catch (error) {
      logger.error('Error re-encrypting wallets:', error);
      throw error;
    }
  }
}
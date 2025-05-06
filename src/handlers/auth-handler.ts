import { UserService } from "../services/user";
import { DbWalletService } from "../services/db-wallet";
import { WalletService } from "../services/wallet";
import { StarknetService } from "../services/starknet";
import { logger } from "../utils/logger";

// Store active sessions (telegramId -> password)
// Note: In a production environment, consider using a more secure session management system
const activeSessions: Map<string, string> = new Map();

export class AuthHandler {
  /**
   * Get user by Telegram ID
   * @param telegramId Telegram user ID
   * @returns User object or null if not found
   */
  static async getUser(telegramId: bigint) {
    try {
      return await UserService.getUserByTelegramId(telegramId);
    } catch (error) {
      logger.error("Error getting user:", error);
      return null;
    }
  }

  /**
   * Register a new user
   * @param telegramId Telegram user ID
   * @param password Password to set
   * @returns Success message or error
   */
  static async register(telegramId: bigint, password: string) {
    try {
      // Check if user already exists
      const existingUser = await UserService.authenticateUser(
        telegramId.toString(),
        password,
      );
      if (existingUser) {
        return "You are already registered. Use /login to access your wallets.";
      }

      // Register the user
      await UserService.registerUser(telegramId.toString(), password);

      activeSessions.set(telegramId.toString(), password);
      return "Registration successful! You can now use /login to access your wallets.";
    } catch (error) {
      logger.error("Error in register handler:", error);
      return "Registration failed. Please try again.";
    }
  }

  /**
   * Log in a user
   * @param telegramId Telegram user ID
   * @param password User's password
   * @returns Success message or error
   */
  static async login(telegramId: bigint, password: string) {
    try {
      const user = await UserService.authenticateUser(telegramId.toString(), password);
      if (!user) {
        return "Invalid credentials. Please try again or use /register if you haven't created an account.";
      }

      // Store the password in the active session
      activeSessions.set(telegramId.toString(), password);

      // Get user's wallets
      const wallets = await DbWalletService.getUserWallets(user.id);

      if (wallets.length === 0) {
        return "Login successful! You don't have any wallets yet. Use /create_wallet to create one.";
      }

      return `Login successful! You have ${wallets.length} wallet(s). Use /wallets to view them.`;
    } catch (error) {
      logger.error("Error in login handler:", error);
      return "Login failed. Please try again.";
    }
  }

  /**
   * Log out a user
   * @param telegramId Telegram user ID
   * @returns Success message
   */
  static logout(telegramId: bigint) {
    activeSessions.delete(telegramId.toString());
    return "You have been logged out. Your private keys are no longer accessible until you log in again.";
  }

  /**
   * Check if a user is authenticated
   * @param telegramId Telegram user ID
   * @returns True if authenticated
   */
  static isAuthenticated(telegramId: bigint) {
    return activeSessions.has(telegramId.toString());
  }

  /**
   * Get the password for an authenticated user
   * @param telegramId Telegram user ID
   * @returns Password or null if not authenticated
   */
  static getPassword(telegramId: bigint) {
    return activeSessions.get(telegramId.toString()) || null;
  }

  /**
   * Create a new wallet for an authenticated user
   * @param telegramId Telegram user ID
   * @param chain Blockchain chain
   * @param starknetService Starknet service instance
   * @returns Success message or error
   */
  static async createWallet(
    telegramId: bigint,
    chain: any,
    starknetService: StarknetService,
  ) {
    try {
      // Check if user is authenticated
      const password = this.getPassword(telegramId);
      if (!password) {
        return "You must be logged in to create a wallet. Use /login first.";
      }

      // Get user from database
      const user = await UserService.authenticateUser(telegramId.toString(), password);
      if (!user) {
        return "Authentication error. Please log in again.";
      }

      // Create wallets
      const walletResponse = await WalletService.createWallets(
        chain,
        starknetService,
      );

      // Save wallets to database
      await DbWalletService.saveWallet(
        user.id,
        walletResponse.ethWalletData,
        password,
      );
      await DbWalletService.saveWallet(
        user.id,
        walletResponse.btcWalletData,
        password,
      );
      if (walletResponse.starknetWalletData) {
        await DbWalletService.saveWallet(
          user.id,
          walletResponse.starknetWalletData,
          password,
        );
      }

      return "Wallets created successfully and securely stored! Use /wallets to view them.";
    } catch (error) {
      logger.error("Error creating wallet:", error);
      return "Failed to create wallet. Please try again.";
    }
  }

  /**
   * Import a wallet for an authenticated user
   * @param telegramId Telegram user ID
   * @param privateKey Private key to import
   * @param chain Blockchain chain
   * @param starknetAddress Starknet address (optional)
   * @param starknetService Starknet service instance (optional)
   * @returns Success message or error
   */
  static async importWallet(
    telegramId: bigint,
    privateKey: string,
    chain: any,
    starknetAddress?: string,
    starknetService?: StarknetService,
  ) {
    try {
      // Check if user is authenticated
      const password = this.getPassword(telegramId);
      if (!password) {
        return "You must be logged in to import a wallet. Use /login first.";
      }

      // Get user from database
      const user = await UserService.authenticateUser(telegramId, password);
      if (!user) {
        return "Authentication error. Please log in again.";
      }

      // Import wallets
      const walletResponse = await WalletService.importFromPrivateKey(
        privateKey,
        chain,
        starknetAddress,
        starknetService,
      );

      // Save wallets to database
      await DbWalletService.saveWallet(
        user.id,
        walletResponse.ethWalletData,
        password,
      );
      await DbWalletService.saveWallet(
        user.id,
        walletResponse.btcWalletData,
        password,
      );
      if (walletResponse.starknetWalletData) {
        await DbWalletService.saveWallet(
          user.id,
          walletResponse.starknetWalletData,
          password,
        );
      }

      return "Wallets imported successfully and securely stored! Use /wallets to view them.";
    } catch (error) {
      logger.error("Error importing wallet:", error);
      return "Failed to import wallet. Please check your private key and try again.";
    }
  }

  /**
   * Get a user's wallets
   * @param telegramId Telegram user ID
   * @returns List of wallets or error message
   */
  static async getWallets(telegramId: bigint) {
    try {
      // Check if user is authenticated
      const password = this.getPassword(telegramId);
      if (!password) {
        return "You must be logged in to view your wallets. Use /login first.";
      }

      // Get user from database
      const user = await UserService.authenticateUser(telegramId, password);
      if (!user) {
        return "Authentication error. Please log in again.";
      }

      // Get wallets from database
      const wallets = await DbWalletService.getUserWallets(user.id);

      if (wallets.length === 0) {
        return "You don't have any wallets yet. Use /create_wallet to create one.";
      }

      // Format wallet list
      const walletList = wallets
        .map((wallet: any, index: number) => {
          return `${index + 1}. ${wallet.chain.toUpperCase()} Wallet: ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`;
        })
        .join("\n");

      return `Your wallets:\n${walletList}\n\nUse /wallet_details [number] to see details.`;
    } catch (error) {
      logger.error("Error getting wallets:", error);
      return "Failed to retrieve wallets. Please try again.";
    }
  }

  /**
   * Get details for a specific wallet
   * @param telegramId Telegram user ID
   * @param walletIndex Index of the wallet (1-based)
   * @returns Wallet details or error message
   */
  static async getWalletDetails(telegramId: bigint, walletIndex: number) {
    try {
      // Check if user is authenticated
      const password = this.getPassword(telegramId);
      if (!password) {
        return "You must be logged in to view wallet details. Use /login first.";
      }

      // Get user from database
      const user = await UserService.authenticateUser(telegramId, password);
      if (!user) {
        return "Authentication error. Please log in again.";
      }

      // Get wallets from database
      const wallets = await DbWalletService.getUserWallets(user.id);

      if (wallets.length === 0) {
        return "You don't have any wallets yet. Use /create_wallet to create one.";
      }

      // Check if wallet index is valid
      if (walletIndex < 1 || walletIndex > wallets.length) {
        return `Invalid wallet number. You have ${wallets.length} wallet(s).`;
      }

      // Get the wallet
      const walletInfo = wallets[walletIndex - 1];
      const wallet = await DbWalletService.getWallet(
        user.id,
        walletInfo.id,
        password,
      );

      // Format wallet details
      return `Wallet Details:
Chain: ${wallet.chain.toUpperCase()}
Address: ${wallet.address}
Private Key: ${wallet.privateKey ? "********" : "Not available"}
Mnemonic: ${wallet.mnemonic ? "********" : "Not available"}

Use /show_private_key ${walletIndex} to reveal the private key.
Use /show_mnemonic ${walletIndex} to reveal the mnemonic (if available).`;
    } catch (error) {
      logger.error("Error getting wallet details:", error);
      return "Failed to retrieve wallet details. Please try again.";
    }
  }

  /**
   * Show a wallet's private key
   * @param telegramId Telegram user ID
   * @param walletIndex Index of the wallet (1-based)
   * @returns Private key or error message
   */
  static async showPrivateKey(telegramId: bigint, walletIndex: number) {
    try {
      // Check if user is authenticated
      const password = this.getPassword(telegramId);
      if (!password) {
        return "You must be logged in to view private keys. Use /login first.";
      }

      // Get user from database
      const user = await UserService.authenticateUser(telegramId, password);
      if (!user) {
        return "Authentication error. Please log in again.";
      }

      // Get wallets from database
      const wallets = await DbWalletService.getUserWallets(user.id);

      // Check if wallet index is valid
      if (walletIndex < 1 || walletIndex > wallets.length) {
        return `Invalid wallet number. You have ${wallets.length} wallet(s).`;
      }

      // Get the wallet
      const walletInfo = wallets[walletIndex - 1];
      const wallet = await DbWalletService.getWallet(
        user.id,
        walletInfo.id,
        password,
      );

      if (!wallet.privateKey) {
        return "Private key is not available for this wallet.";
      }

      return `⚠️ PRIVATE KEY (keep it secret!) ⚠️\n${wallet.privateKey}`;
    } catch (error) {
      logger.error("Error showing private key:", error);
      return "Failed to retrieve private key. Please try again.";
    }
  }
}

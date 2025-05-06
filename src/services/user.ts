import { PrismaClient } from "@prisma/client";
import { EncryptionService } from "../utils/encryption";
import { logger } from "../utils/logger";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

export class UserService {
  /**
   * Get user by Telegram ID
   * @param telegramId Telegram user ID
   * @returns User object or null if not found
   */
  static async getUserByTelegramId(telegramId: bigint) {
    try {
      return await prisma.user.findUnique({
        where: { telegramId },
      });
    } catch (error) {
      logger.error("Error getting user by Telegram ID:", error);
      return null;
    }
  }

  /**
   * Register a new user
   * @param telegramId Telegram user ID
   * @param password User's password
   * @returns Created user object
   */
  static async registerUser(telegramId: string, password: string) {
    try {
      // Hash the password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create the user
      return await prisma.user.create({
        data: {
          telegramId,
          passwordHash,
        },
      });
    } catch (error) {
      logger.error("Error registering user:", error);
      throw error;
    }
  }

  /**
   * Authenticate a user
   * @param telegramId Telegram user ID
   * @param password User's password
   * @returns User object if authenticated, null otherwise
   */
  static async authenticateUser(telegramId: string, password: string) {
    try {
      // Get user from database
      const user = await prisma.user.findUnique({
        where: { telegramId },
      });

      if (!user) {
        return null;
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return null;
      }

      return user;
    } catch (error) {
      logger.error("Error authenticating user:", error);
      return null;
    }
  }

  /**
   * Change a user's password
   * @param telegramId Telegram user ID
   * @param currentPassword Current password
   * @param newPassword New password
   * @returns True if password was changed successfully
   */
  static async changePassword(
    telegramId: bigint,
    currentPassword: string,
    newPassword: string,
  ) {
    try {
      // First authenticate with current password
      const user = await this.authenticateUser(telegramId, currentPassword);

      if (!user) {
        return false;
      }

      // Hash the new password
      const newPasswordHash = EncryptionService.hashPassword(newPassword);

      // Update the user's password hash
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      });

      return true;
    } catch (error) {
      logger.error("Error changing password:", error);
      throw error;
    }
  }
}

import * as crypto from "crypto";

export class EncryptionService {
  // Use AES-256-GCM for encryption (more secure than older methods)
  private static algorithm = "aes-256-gcm";
  private static encryptionKey: string;

  constructor(key: string) {
    if (!key) {
      throw new Error("Encryption key not set");
    }
    EncryptionService.encryptionKey = key;
  }

  /**
   * Encrypts data using a password
   * @param data The data to encrypt (private key, mnemonic, etc.)
   * @param password User's password
   * @returns Encrypted data as a string
   */
  static encrypt(data: string, password: string): string {
    // Create a key from the password using PBKDF2
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");

    // Create an initialization vector
    const iv = crypto.randomBytes(16);

    // Create cipher and encrypt
    const cipher = crypto.createCipheriv(
      this.algorithm,
      key,
      iv,
    ) as crypto.CipherGCM;
    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    // Get the auth tag for GCM
    const authTag = cipher.getAuthTag();

    // Combine all parts: salt, iv, authTag, and encrypted data
    // Format: salt:iv:authTag:encryptedData
    return (
      Buffer.from(salt).toString("hex") +
      ":" +
      Buffer.from(iv).toString("hex") +
      ":" +
      Buffer.from(authTag).toString("hex") +
      ":" +
      encrypted
    );
  }

  /**
   * Decrypts data using a password
   * @param encryptedData The encrypted data string
   * @param password User's password
   * @returns Decrypted data as a string
   */
  static decrypt(encryptedData: string, password: string): string {
    // Split the parts
    const parts = encryptedData.split(":");
    if (parts.length !== 4) {
      throw new Error("Invalid encrypted data format");
    }

    const salt = Buffer.from(parts[0], "hex");
    const iv = Buffer.from(parts[1], "hex");
    const authTag = Buffer.from(parts[2], "hex");
    const encryptedText = parts[3];

    // Recreate the key using the same parameters
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256");

    // Create decipher
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      key,
      iv,
    ) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Hashes a password for storage
   * @param password User's password
   * @returns Hashed password
   */
  static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, "sha256")
      .toString("hex");
    return `${salt}:${hash}`;
  }

  /**
   * Verifies a password against a stored hash
   * @param password User's password
   * @param storedHash The stored password hash
   * @returns True if password matches
   */
  static verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hash] = storedHash.split(":");
    const verifyHash = crypto
      .pbkdf2Sync(password, salt, 100000, 64, "sha256")
      .toString("hex");
    return hash === verifyHash;
  }
}

// A singleton instance...
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "key";
export const encryptionService = new EncryptionService(ENCRYPTION_KEY);

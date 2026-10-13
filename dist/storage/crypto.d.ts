export declare function getMasterKey(): Buffer;
export interface EncryptedData {
    ciphertext: string;
    iv: string;
    tag: string;
}
export declare function encryptSecret(plainText: string): EncryptedData;
export declare function decryptSecret(encrypted: EncryptedData): string;
export declare function redactSecret(secret: string): string;

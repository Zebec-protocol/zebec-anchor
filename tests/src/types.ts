import { PublicKey } from "@solana/web3.js";
export interface Accounts {
  pubkey: PublicKey;
  isWritable: boolean;
  isSigner: boolean;
}

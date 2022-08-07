import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { Accounts } from "./types";

export const airdropSol = async (
  connection: anchor.web3.Connection,
  wallet_address: PublicKey
): Promise<string> => {
  const signature = connection.requestAirdrop(
    wallet_address,
    3 * LAMPORTS_PER_SOL
  );
  const tx = await connection.confirmTransaction(await signature);
  return signature;
};
export const airdropDelay = async (ms: number): Promise<unknown> => {
  const delay = new Promise((resolve) => setTimeout(resolve, ms));
  return delay;
};
export const getClusterTime = async (connection: anchor.web3.Connection) => {
  const parsedClock = await connection.getParsedAccountInfo(
    anchor.web3.SYSVAR_CLOCK_PUBKEY
  );
  const parsedClockAccount = (
    parsedClock.value!.data as anchor.web3.ParsedAccountData
  ).parsed;
  const clusterTimeStamp = parsedClockAccount.info.unixTimestamp;
  return clusterTimeStamp;
};
export const solFromProvider = async (
  provider: anchor.Provider,
  receiver: PublicKey,
  amount: number
) => {
  let txFund = new anchor.web3.Transaction();
  txFund.add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: receiver,
      lamports: amount * anchor.web3.LAMPORTS_PER_SOL,
    })
  );
  const sigTxFund = await provider.send(txFund);
};

export const getTxSize = (
  accounts: Array<Accounts>,
  owners: Array<PublicKey>,
  isDataVector: boolean
) => {
  const vec_discriminator = 8;
  const discriminator = 8;
  const pubkey_size = 32;
  const account_size = vec_discriminator + accounts.length * (32 + 1 + 1);
  let data_size = discriminator + 32 * owners.length;
  if (isDataVector) {
    data_size = data_size + vec_discriminator;
  }
  const num_owner = owners.length + 1;
  const sig_vec_size = vec_discriminator + num_owner * 1;
  const txSize =
    discriminator +
    pubkey_size +
    pubkey_size +
    account_size +
    data_size +
    sig_vec_size +
    1 +
    4;
  return txSize;
};

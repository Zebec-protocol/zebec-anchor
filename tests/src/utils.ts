import * as anchor from "@project-serum/anchor";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

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
  isDataVector: boolean,
  data_size: number
) => {
  const vec_discriminator = 8;
  const discriminator = 8;
  const pubkey_size = 32;
  const account_size = vec_discriminator + accounts.length * (32 + 1 + 1);
  let datasize = discriminator + data_size;
  if (isDataVector) {
    datasize = data_size + vec_discriminator;
  }
  const num_owner = owners.length;
  const sig_vec_size = vec_discriminator + num_owner * 1;
  const txSize =
    discriminator +
    pubkey_size + //multisig program id
    pubkey_size + // program id
    account_size + //account vector
    datasize + //size of data
    sig_vec_size + //signed vector
    1 + //did execute bool
    4; //Owner set sequence number.
  return txSize;
};

export const tokenFromProvider = async (
  provider: anchor.Provider,
  receiver: PublicKey,
  mint: PublicKey,
  amount: number
) => {
  try {
    const destination = await getAssociatedTokenAddress(mint, receiver, true);
    const source = await getAssociatedTokenAddress(
      mint,
      provider.wallet.publicKey,
      true
    );
    let txFund = new anchor.web3.Transaction();

    txFund.add(
      createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        destination,
        receiver,
        mint
      ),
      createTransferInstruction(
        source,
        destination,
        provider.wallet.publicKey,
        amount
      )
    );
    txFund.feePayer = provider.wallet.publicKey;
    const { blockhash, lastValidBlockHeight } =
      await provider.connection.getLatestBlockhash();
    txFund.recentBlockhash = blockhash;
    txFund.lastValidBlockHeight = lastValidBlockHeight;
    const signed = await provider.wallet.signTransaction(txFund);
    const sigTxFund = await provider.send(signed);
    console.log("sigTxFund", sigTxFund);
  } catch (e) {
    console.log(e);
  }
};

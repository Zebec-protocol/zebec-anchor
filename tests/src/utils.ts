import {
  PublicKey,
  LAMPORTS_PER_SOL,
  GetProgramAccountsFilter,
} from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";
import { Accounts } from "./types";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

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

export const getBalanceOfSplToken = async (
  splTokenAddress,
  wallet,
  provider: anchor.Provider
) => {
  const filters: GetProgramAccountsFilter[] = [
    {
      dataSize: 165, //size of account (bytes)
    },
    {
      memcmp: {
        offset: 32, //location of our query in the account (bytes)
        bytes: wallet,
      },
    },
  ];
  const accounts = await provider.connection.getParsedProgramAccounts(
    TOKEN_PROGRAM_ID,
    {
      filters: filters,
    }
  );
  await airdropDelay(2000);
  let tokenBalance = 0;
  accounts.forEach((account, i) => {
    const parsedAccountInfo: any = account.account.data;
    const mintAddress: string = parsedAccountInfo["parsed"]["info"]["mint"];
    if (splTokenAddress == mintAddress) {
      tokenBalance =
        parsedAccountInfo["parsed"]["info"]["tokenAmount"]["amount"];
      return;
    }
  });
  return tokenBalance;
};

export const getTxTime = async (tx: string, provider: anchor.Provider) => {
  await new Promise((r) => setTimeout(r, 1000));
  let startStreamTxTime = await provider.connection.getTransaction(tx, {
    commitment: "confirmed",
  });
  let { blockTime } = startStreamTxTime;
  return blockTime;
};

export async function getNativeTokenBalance(
  address: PublicKey,
  provider: anchor.Provider
) {
  let tokenBalance = await provider.connection.getBalance(address);
  return tokenBalance;
}

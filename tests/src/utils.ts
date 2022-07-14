import { PublicKey,LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from '@project-serum/anchor';

export const airdropSol = async (connection:anchor.web3.Connection,wallet_address: PublicKey): Promise<string> => {
    const signature = connection.requestAirdrop(wallet_address, LAMPORTS_PER_SOL)
    const tx = await connection.confirmTransaction(await signature);
    return signature
  }
  export const airdropDelay =  async (ms: number): Promise<unknown> => {
    const delay= new Promise( resolve => setTimeout(resolve, ms) );
    return delay
  }
  export const getClusterTime = async (connection:anchor.web3.Connection) => {
    const parsedClock = await connection.getParsedAccountInfo(
      anchor.web3.SYSVAR_CLOCK_PUBKEY
    );
    const parsedClockAccount = (parsedClock.value!.data as anchor.web3.ParsedAccountData)
      .parsed;
    const clusterTimeStamp = parsedClockAccount.info.unixTimestamp;
    return clusterTimeStamp;
  };
  export const solFromProvider = async (provider:anchor.Provider,receiver:PublicKey,amount:number)=>
  {
    let txFund = new anchor.web3.Transaction();
    txFund.add(anchor.web3.SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: receiver,
        lamports: amount * anchor.web3.LAMPORTS_PER_SOL,
    }));
    const sigTxFund = await provider.send(txFund);
  }
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from '@project-serum/anchor';
import {OPERATE, programZebec,OPERATEDATA} from "./Constants"
import * as spl from '@solana/spl-token'

export const feeVault = async (fee_receiver:PublicKey): Promise<anchor.web3.PublicKey> => {
    const [fee_vault ,_un] = await PublicKey.findProgramAddress([fee_receiver.toBuffer(),
      anchor.utils.bytes.utf8.encode(OPERATE),], programZebec)
    return fee_vault
  }
export  const create_fee_account = async (fee_receiver:PublicKey): Promise<anchor.web3.PublicKey> => {
    const [create_fee_account ,_]= await PublicKey.findProgramAddress([fee_receiver.toBuffer(),
      anchor.utils.bytes.utf8.encode(OPERATEDATA),(await feeVault(fee_receiver)).toBuffer()], programZebec)
    return create_fee_account
  }
export  const zebecVault = async (sender:PublicKey): Promise<anchor.web3.PublicKey> => {
  const [zebecVault, bumps]= await PublicKey.findProgramAddress([
    sender.toBuffer()], programZebec
  )
  return zebecVault
}
export const withdrawData = async (prefix:string,sender:PublicKey,mint?: anchor.web3.PublicKey): Promise<anchor.web3.PublicKey> => {
    if (mint){
      const [withdrawData, bumps]= await PublicKey.findProgramAddress([
        anchor.utils.bytes.utf8.encode(prefix),sender.toBuffer(),mint.toBuffer()], programZebec)
      return withdrawData
    }
    else{
      const [withdrawData, bumps]= await PublicKey.findProgramAddress([anchor.utils.bytes.utf8.encode(prefix),
        sender.toBuffer()], programZebec
      )
      return withdrawData
    }
  }
export const getTokenBalance = async (connection:anchor.web3.Connection,tokenAccount:PublicKey): Promise<bigint | undefined> => {
    const tokenAccountInfo = await connection.getAccountInfo(
      tokenAccount
    );
    const data = Buffer.from(tokenAccountInfo.data);
    const accountInfo = spl.AccountLayout.decode(data);
    return accountInfo.amount;
  }
export const createMint = async (provider:  anchor.Provider, tokenMint: anchor.web3.Keypair): Promise<anchor.web3.PublicKey> => {
    const lamportsForMint = await provider.connection.getMinimumBalanceForRentExemption(spl.MintLayout.span);
    let tx = new anchor.web3.Transaction();
    // Allocate mint
    tx.add(
        anchor.web3.SystemProgram.createAccount({
            programId: spl.TOKEN_PROGRAM_ID,
            space: spl.MintLayout.span,
            fromPubkey: provider.wallet.publicKey,
            newAccountPubkey: tokenMint.publicKey,
            lamports: lamportsForMint,
        })
    )
    // Allocate wallet account
    tx.add(
        spl.createInitializeMintInstruction(
            tokenMint.publicKey,
            6,
            provider.wallet.publicKey,
            provider.wallet.publicKey,
            spl.TOKEN_PROGRAM_ID,
        )
    );
    const signature = await provider.send(tx, [tokenMint]);
    console.log(`Created new mint account at ${signature}`);
    return tokenMint.publicKey;
  }
export const createUserAndAssociatedWallet = async (provider:  anchor.Provider, sender:anchor.web3.Keypair,mint?: anchor.web3.PublicKey): Promise<anchor.web3.PublicKey | undefined> => {
    let userAssociatedTokenAccount: anchor.web3.PublicKey | undefined = undefined;
    // Fund sender with some SOL
    let txFund = new anchor.web3.Transaction();
    txFund.add(anchor.web3.SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: sender.publicKey,
        lamports: 5 * anchor.web3.LAMPORTS_PER_SOL,
    }));
    const sigTxFund = await provider.send(txFund);
    if (mint) {
        // Create a token account for the sender and mint some tokens
        userAssociatedTokenAccount = await spl.getAssociatedTokenAddress(
            mint,
            sender.publicKey,
            true,
            spl.TOKEN_PROGRAM_ID,
            spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        )
        const txFundTokenAccount = new anchor.web3.Transaction();
        txFundTokenAccount.add(spl.createAssociatedTokenAccountInstruction(
            sender.publicKey,
            userAssociatedTokenAccount,
            sender.publicKey,
            mint,
            spl.TOKEN_PROGRAM_ID,
            spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        ))
        txFundTokenAccount.add(spl.createMintToInstruction(
            mint,
            userAssociatedTokenAccount,
            provider.wallet.publicKey,
            1337000000,
            [],
            spl.TOKEN_PROGRAM_ID,
        ));
        await provider.send(txFundTokenAccount, [sender]);
      }
    return userAssociatedTokenAccount;
  }

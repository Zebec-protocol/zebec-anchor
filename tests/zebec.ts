import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Zebec } from '../target/types/zebec';
import * as spl from '@solana/spl-token'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider)
  const programId = new anchor.web3.PublicKey("3svmYpJGih9yxkgqpExNdQZLKQ7Wu5SEjaVUbmbytUJg");
  const idl = JSON.parse(
    require("fs").readFileSync("./target/idl/zebec.json", "utf8")
  );
  const program = new anchor.Program(idl, programId);
  async function airdrop_sol(wallet_address: PublicKey){
      const signature = program.provider.connection.requestAirdrop(wallet_address, LAMPORTS_PER_SOL)
      const tx = await program.provider.connection.confirmTransaction(await signature);
      console.log("Your transaction signature", signature);
  }
  function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
describe('zebec', () => {
  const sender = anchor.web3.Keypair.generate();
  let dataAccount = anchor.web3.Keypair.generate();
  const receiver = anchor.web3.Keypair.generate();
  const PREFIX = "withdraw_sol"
  const PREFIX_TOKEN= "withdraw_token"

  console.log("Sender key: "+sender.publicKey.toBase58())
  console.log("Receiver key: "+receiver.publicKey.toBase58())
  console.log("Pda key: "+dataAccount.publicKey.toBase58())
  const PREFIXMULTISIG = "withdraw_multisig_sol";

  it('Airdrop Solana', async()=>{
    await airdrop_sol(sender.publicKey)
  })

  it('Deposit Sol', async () => {
    const [zebecVault, bumps]= await PublicKey.findProgramAddress([
      sender.publicKey.toBuffer()], program.programId
    )
    const amount=new anchor.BN(1000000)
    const tx = await program.rpc.depositSol(amount,{
      accounts:{
        zebecVault: zebecVault,
        sender: sender.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers:[sender],
      instructions:[
      ],
    });
    console.log("Your transaction signature", tx);
  });

  it('Stream Sol', async () => {
    const [withdraw_data, _]= await PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode(PREFIX),sender.publicKey.toBuffer()], program.programId
    )
    let now = Math.floor(new Date().getTime() / 1000)
    const startTime = new anchor.BN(now-1000) 
    const paused = new anchor.BN(now) 
    const endTime=new anchor.BN(now+3600)
    console.log("Time: "+endTime.toString())
    const amount=new anchor.BN(1000)
    const tx = await program.rpc.nativeStream(startTime,endTime,amount,{
      accounts:{
        dataAccount: dataAccount.publicKey,
        withdrawData: withdraw_data,
        systemProgram: anchor.web3.SystemProgram.programId,
        sender: sender.publicKey,
        receiver:receiver.publicKey
      },
      signers:[sender,dataAccount],
      instructions:[
        // await program.account.stream.createInstruction(sender,2000),
      ],
    });
    console.log("Your transaction signature", tx);
  });
  it('Withdraw Sol', async () => {
    const [withdraw_data, _]= await PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode(PREFIX),sender.publicKey.toBuffer()], program.programId
    )
    const [zebecVault, bumps]= await PublicKey.findProgramAddress([
      sender.publicKey.toBuffer()], program.programId
    )
    console.log("MasterPda "+zebecVault);
    console.log("withdraw_data "+withdraw_data);
      
    const tx = await program.rpc.withdrawStream({
      accounts:{
        zebecVault: zebecVault,
        sender: sender.publicKey,
        receiver:receiver.publicKey,
        dataAccount:dataAccount.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers:[receiver],
      instructions:[
      ],
    });
    console.log("Your transaction signature", tx);
  });
  it('Pause Stream', async () => {
    const [withdraw_data, _]= await PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode(PREFIX),sender.publicKey.toBuffer()], program.programId
    )
    const [zebecVault, bumps]= await PublicKey.findProgramAddress([
      sender.publicKey.toBuffer()], program.programId
    )
    const tx = await program.rpc.pauseStream({
      accounts:{
        sender: sender.publicKey,
        receiver:receiver.publicKey,
        dataAccount:dataAccount.publicKey,
      },
      signers:[sender],
      instructions:[
      ],
    });
    console.log("Your transaction signature", tx);
  });
  it('Resume Stream', async () => {
    const [withdraw_data, _]= await PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode(PREFIX),sender.publicKey.toBuffer()], program.programId
    )
    const [zebecVault, bumps]= await PublicKey.findProgramAddress([
      sender.publicKey.toBuffer()], program.programId
    )
    const tx = await program.rpc.pauseStream({
      accounts:{
        sender: sender.publicKey,
        receiver:receiver.publicKey,
        dataAccount:dataAccount.publicKey,
      },
      signers:[sender],
      instructions:[
      ],
    });
    console.log("Your transaction signature", tx);
  });
  });

  describe('zebec token', () => {

    const program = new anchor.Program(idl, programId);
    const sender = anchor.web3.Keypair.generate();
    const dataAccount = anchor.web3.Keypair.generate();
    const receiver = anchor.web3.Keypair.generate();
    const PREFIX = "withdraw_sol"
    const PREFIX_TOKEN= "withdraw_token"
    const user =  anchor.web3.Keypair.generate();
    const dest =  anchor.web3.Keypair.generate();
    const tokenMint = new anchor.web3.Keypair();
    const fee_receiver = new anchor.web3.PublicKey("EsDV3m3xUZ7g8QKa1kFdbZT18nNz8ddGJRcTK84WDQ7k")

    const createMint = async (connection: anchor.web3.Connection): Promise<anchor.web3.PublicKey> => {
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
      console.log(`[${tokenMint.publicKey}] Created new mint account at ${signature}`);
      return tokenMint.publicKey;
  }
  const createUserAndAssociatedWallet = async (connection: anchor.web3.Connection, mint?: anchor.web3.PublicKey): Promise<anchor.web3.PublicKey | undefined> => {
    let userAssociatedTokenAccount: anchor.web3.PublicKey | undefined = undefined;
    // Fund user with some SOL
    let txFund = new anchor.web3.Transaction();
    txFund.add(anchor.web3.SystemProgram.transfer({
        fromPubkey: provider.wallet.publicKey,
        toPubkey: user.publicKey,
        lamports: 5 * anchor.web3.LAMPORTS_PER_SOL,
    }));
    const sigTxFund = await provider.send(txFund);
    console.log(`[${user.publicKey.toBase58()}] Funded new account with 5 SOL: ${sigTxFund}`);
    if (mint) {
        // Create a token account for the user and mint some tokens
        userAssociatedTokenAccount = await spl.getAssociatedTokenAddress(
            mint,
            user.publicKey,
            true,
            spl.TOKEN_PROGRAM_ID,
            spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        )
        const txFundTokenAccount = new anchor.web3.Transaction();
        txFundTokenAccount.add(spl.createAssociatedTokenAccountInstruction(
            user.publicKey,
            userAssociatedTokenAccount,
            user.publicKey,
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
        const txFundTokenSig = await provider.send(txFundTokenAccount, [user]);
        console.log(`[${userAssociatedTokenAccount.toBase58()}] New associated account for mint ${mint.toBase58()}: ${txFundTokenSig}`);
      }
      return userAssociatedTokenAccount;
    }
    it('Airdrop Solana', async()=>{
      await airdrop_sol(user.publicKey)
      await airdrop_sol(dest.publicKey)
    })
    it('Token Stream',async()=>{
      const mint = await createMint(provider.connection);
      console.log("The mint is %s",mint.toBase58())
      console.log("The data account is %s",dataAccount.publicKey.toBase58())
      const [withdraw_data, _]= await PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode(PREFIX_TOKEN),user.publicKey.toBuffer(),mint.toBuffer()], program.programId)
      let now = Math.floor(new Date().getTime() / 1000)
      const startTime = new anchor.BN(now-1000) 
      const endTime=new anchor.BN(now+200)
      const withdrawLimit=new anchor.BN(1000)
      const amount=new anchor.BN(1000)
      const tx = await program.rpc.tokenStream(startTime,endTime,amount,withdrawLimit,{
        accounts:{
          dataAccount: dataAccount.publicKey,
          withdrawData: withdraw_data,
          sourceAccount: user.publicKey,
          destAccount:dest.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram:spl.TOKEN_PROGRAM_ID,
          mint:mint,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers:[user,dataAccount],
        instructions:[],
    });
    console.log("Your signature is ", tx);
    }
    )
    it('Token Deposit',async()=>{
  
      const connection = new Connection("http://localhost:8899", "confirmed");
      const source_token_account = await createUserAndAssociatedWallet(connection,tokenMint.publicKey)
      console.log("The source token account is %s",source_token_account.toString());
      const [zebecVault, _]= await PublicKey.findProgramAddress([
        user.publicKey.toBuffer(),], program.programId);
      const pda_token_account =await spl.getAssociatedTokenAddress(
          tokenMint.publicKey,
          zebecVault,
          true,
          spl.TOKEN_PROGRAM_ID,
          spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      )
      const amount=new anchor.BN(1000000)  
      const tx = await program.rpc.depositToken(amount,{
        accounts:{
          zebecVault:zebecVault,
          sourceAccount: user.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram:spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram:spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
          mint:tokenMint.publicKey,
          sourceAccountTokenAccount:source_token_account,
          pdaAccountTokenAccount:pda_token_account
        },
        signers:[user,],
        instructions:[],
    });
    console.log("Your signature is ", tx);
    }
    )
    it('Pause Stream Token', async () => {
      const tx = await program.rpc.pauseResumeTokenStream({
        accounts:{
          sender: user.publicKey,
          receiver:dest.publicKey,
          dataAccount:dataAccount.publicKey,
        },
        signers:[user],
        instructions:[
        ],
      });
      console.log("Your transaction signature", tx);
    });
    it('Resume Stream Token', async () => {
      const tx = await program.rpc.pauseResumeTokenStream({
        accounts:{
          sender: user.publicKey,
          receiver:dest.publicKey,
          dataAccount:dataAccount.publicKey,
        },
        signers:[user],
        instructions:[
        ],
      });
      console.log("Your transaction signature", tx);
    });
  
    it('Withdraw Token Stream',async()=>{
         const [zebecVault, _]= await PublicKey.findProgramAddress([
        user.publicKey.toBuffer(),], program.programId);
      const [withdraw_data, _b]= await PublicKey.findProgramAddress([
        anchor.utils.bytes.utf8.encode(PREFIX_TOKEN),user.publicKey.toBuffer(),tokenMint.publicKey.toBuffer()], program.programId)
      
      const pda_token_account =await spl.getAssociatedTokenAddress(
          tokenMint.publicKey,
          zebecVault,
          true,
          spl.TOKEN_PROGRAM_ID,
          spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      )
      const dest_token_account =await spl.getAssociatedTokenAddress(
        tokenMint.publicKey,
        dest.publicKey,
        true,
        spl.TOKEN_PROGRAM_ID,
        spl.ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    const fee_token_account =await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      fee_receiver,
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
    )
      const amount=new anchor.BN(100)  
      const tx = await program.rpc.withdrawTokenStream(amount,{
        accounts:{
          destAccount:dest.publicKey,
          sourceAccount: user.publicKey,
          feeReceiver:fee_receiver,
          zebecVault:zebecVault,
          dataAccount:dataAccount.publicKey,
          withdrawData:withdraw_data,     
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram:spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram:spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
          mint:tokenMint.publicKey,
          pdaAccountTokenAccount:pda_token_account,
          destTokenAccount:dest_token_account,
          feeRecieverTokenAccount:fee_token_account,
        },
        signers:[dest,],
    });
    console.log("Your signature for withdraw is ", tx);
    await delay(10);
    }
 
    )
  });
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
describe('zebec native', () => {
  //constants
  const PREFIX = "withdraw_sol"
  const PREFIX_TOKEN= "withdraw_token"
  const OPERATE="NewVaultOption";
  const OPERATEDATA="NewVaultOptionData";

  //data account
  let dataAccount = anchor.web3.Keypair.generate();

  //user accounts
  const sender = anchor.web3.Keypair.generate();
  const receiver = anchor.web3.Keypair.generate();
  const fee_receiver = new anchor.web3.Keypair();

  console.log("Sender key: "+sender.publicKey.toBase58())
  console.log("Receiver key: "+receiver.publicKey.toBase58())
  console.log("Pda key: "+dataAccount.publicKey.toBase58())
  const PREFIXMULTISIG = "withdraw_multisig_sol";

  it('Airdrop Solana', async()=>{
    await airdrop_sol(sender.publicKey)
    await airdrop_sol(fee_receiver.publicKey)
  })
  it('Create Set Vault',async()=>{
    const [fee_vault ,_un]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
    anchor.utils.bytes.utf8.encode(OPERATE),], program.programId)
    const [create_set_data ,_]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
      anchor.utils.bytes.utf8.encode(OPERATEDATA),fee_vault.toBuffer()], program.programId)

    const fee_percentage=new anchor.BN(25)
    const tx = await program.rpc.createVault(fee_percentage,{
      accounts:{
        feeVault: fee_vault,
        createVaultData: create_set_data,
        owner: fee_receiver.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent:anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers:[fee_receiver],
      instructions:[],
  });
  console.log("Your signature is ", tx);
  }
  )
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
    const [fee_vault ,_un]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
      anchor.utils.bytes.utf8.encode(OPERATE),], program.programId)
    const [create_set_data ,_non]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
        anchor.utils.bytes.utf8.encode(OPERATEDATA),fee_vault.toBuffer()], program.programId)

    let now = Math.floor(new Date().getTime() / 1000)
    const startTime = new anchor.BN(now-1000) 
    const paused = new anchor.BN(now) 
    const endTime=new anchor.BN(now+3600)
    const amount=new anchor.BN(1000)
    let pda = anchor.web3.Keypair.generate();

    const tx = await program.rpc.nativeStream(startTime,endTime,amount,{
      accounts:{
        dataAccount: dataAccount.publicKey,
        withdrawData: withdraw_data,
        feeOwner:fee_receiver.publicKey,
        createVaultData:create_set_data,
        feeVault:fee_vault,
        systemProgram: anchor.web3.SystemProgram.programId,
        sender: sender.publicKey,
        receiver:receiver.publicKey
      },
      signers:[sender,dataAccount],
      instructions:[
        // await program.account.pda.createInstruction(pda,3000),
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
    const [fee_vault ,_un]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
      anchor.utils.bytes.utf8.encode(OPERATE),], program.programId)
    const [create_set_data ,_non]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
        anchor.utils.bytes.utf8.encode(OPERATEDATA),fee_vault.toBuffer()], program.programId)
      
    const tx = await program.rpc.withdrawStream({
      accounts:{
        zebecVault: zebecVault,
        sender: sender.publicKey,
        receiver:receiver.publicKey,
        dataAccount:dataAccount.publicKey,
        feeOwner:fee_receiver.publicKey,
        createVaultData:create_set_data,
        feeVault:fee_vault,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers:[receiver],
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
  it('Retrieve Fees',async()=>{
    const [fee_vault ,_un]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
    anchor.utils.bytes.utf8.encode(OPERATE),], program.programId)
    const [create_set_data ,_]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
    anchor.utils.bytes.utf8.encode(OPERATEDATA),fee_vault.toBuffer()], program.programId)

    const tx = await program.rpc.withdrawFeesSol({
      accounts:{
        feeOwner: fee_receiver.publicKey,
        createVaultData: create_set_data,
        feeVault: fee_vault,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent:anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers:[fee_receiver],
      instructions:[],
  });
  console.log("Your signature is ", tx);
  }
  )
  it('Create Multisig', async () => {
    const [withdraw_data, _]= await PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode(PREFIX),sender.publicKey.toBuffer()], program.programId
    )
    const [zebecVault, bumps]= await PublicKey.findProgramAddress([
      sender.publicKey.toBuffer()], program.programId
    )
    dataAccount = anchor.web3.Keypair.generate();

    const [multisig_safe, _bumps]= await PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode(PREFIXMULTISIG),
      dataAccount.publicKey.toBuffer()], program.programId
    )
    const multisigSize = 392; 
    const signers = [sender.publicKey,receiver.publicKey,anchor.web3.Keypair.generate().publicKey]
    const tx = await program.rpc.createMultisig(signers,new anchor.BN(2),{
      accounts:{
        multisigSafe:multisig_safe,
        sender: sender.publicKey,
        dataAccount:dataAccount.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers:[sender,dataAccount],
      instructions:[
      ],
    });
    console.log("Your transaction signature", tx);
  });
  });

describe('zebec token', () => {
  //program id
  });

  describe('zebec token', () => {

    const program = new anchor.Program(idl, programId);
  //constant strings
    const PREFIX_TOKEN= "withdraw_token"
    const OPERATE="NewVaultOption";
    const OPERATEDATA="NewVaultOptionData";
  //data account
    const dataAccount = anchor.web3.Keypair.generate();
  //token mint
    const tokenMint = new anchor.web3.Keypair();
  //users account
    const user =  anchor.web3.Keypair.generate();
    const dest =  anchor.web3.Keypair.generate();
    const fee_receiver = new anchor.web3.Keypair();
    

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
      await airdrop_sol(fee_receiver.publicKey)
    })
    it('Create Set Vault',async()=>{
      const [fee_vault ,_un]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
      anchor.utils.bytes.utf8.encode(OPERATE),], program.programId)
      const [create_set_data ,_]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
        anchor.utils.bytes.utf8.encode(OPERATEDATA),fee_vault.toBuffer()], program.programId)
  
      const fee_percentage=new anchor.BN(25)
      const tx = await program.rpc.createVault(fee_percentage,{
        accounts:{
          feeVault: fee_vault,
          createVaultData: create_set_data,
          owner: fee_receiver.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers:[fee_receiver],
        instructions:[],
    });
    console.log("Your signature for create vault is ", tx);
    }
    )
    it('Token Stream',async()=>{
      const mint = await createMint(provider.connection);
      console.log("The mint is %s",mint.toBase58())
      console.log("The data account is %s",dataAccount.publicKey.toBase58())
      const [withdraw_data, _]= await PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode(PREFIX_TOKEN),user.publicKey.toBuffer(),mint.toBuffer()], program.programId)
      const [fee_vault ,_un]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
        anchor.utils.bytes.utf8.encode(OPERATE),], program.programId)
      const [create_set_data ,_non]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
          anchor.utils.bytes.utf8.encode(OPERATEDATA),fee_vault.toBuffer()], program.programId)
  
      let now = Math.floor(new Date().getTime() / 1000)
      const startTime = new anchor.BN(now-1000) 
      const endTime=new anchor.BN(now+2000)
      const withdrawLimit=new anchor.BN(1000000)
      const amount=new anchor.BN(1000000)
      const tx = await program.rpc.tokenStream(startTime,endTime,amount,withdrawLimit,{
        accounts:{
          dataAccount: dataAccount.publicKey,
          withdrawData: withdraw_data,
          feeOwner:fee_receiver.publicKey,
          createVaultData:create_set_data,
          feeVault:fee_vault,
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
    console.log("Your transaction for token stream signature", tx);
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
    console.log("Your transaction for deposit token signature", tx);
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
      console.log("Your transaction for pause token stream signature", tx);
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
      console.log("Your transaction for resume token stream signature", tx);
    });  

    it('Withdraw Token Stream',async()=>{
         const [zebecVault, _]= await PublicKey.findProgramAddress([
        user.publicKey.toBuffer(),], program.programId);
      const [withdraw_data, _b]= await PublicKey.findProgramAddress([
        anchor.utils.bytes.utf8.encode(PREFIX_TOKEN),user.publicKey.toBuffer(),tokenMint.publicKey.toBuffer()], program.programId)
      const [fee_vault ,_un]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
          anchor.utils.bytes.utf8.encode(OPERATE),], program.programId)
      const [create_set_data ,_non]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
            anchor.utils.bytes.utf8.encode(OPERATEDATA),fee_vault.toBuffer()], program.programId)
    
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
      fee_vault,
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
    )
      const tx = await program.rpc.withdrawTokenStream({
        accounts:{
          destAccount:dest.publicKey,
          sourceAccount: user.publicKey,
          feeOwner:fee_receiver.publicKey,
          createVaultData:create_set_data,
          feeVault:fee_vault,
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
    console.log("Your signature for withdraw token stream is ", tx);
    }
    )
    it('Retrieve Fees',async()=>{
      const [fee_vault ,_un]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
      anchor.utils.bytes.utf8.encode(OPERATE),], program.programId)
      const [create_set_data ,_]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
        anchor.utils.bytes.utf8.encode(OPERATEDATA),fee_vault.toBuffer()], program.programId)
        const fee_owner_token_account =await spl.getAssociatedTokenAddress(
          tokenMint.publicKey,
          fee_receiver.publicKey,
          true,
          spl.TOKEN_PROGRAM_ID,
          spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      )
      const fee_vault_token_account =await spl.getAssociatedTokenAddress(
        tokenMint.publicKey,
        fee_vault,
        true,
        spl.TOKEN_PROGRAM_ID,
        spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      )
      const tx = await program.rpc.withdrawFeesToken({
        accounts:{
          feeOwner: fee_receiver.publicKey,
          createVaultData: create_set_data,
          feeVault: fee_vault,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram:spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram:spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
          mint:tokenMint.publicKey,
          feeRecieverVaultTokenAccount:fee_vault_token_account,
          feeOwnerTokenAccount:fee_owner_token_account,
        },
        signers:[fee_receiver],
        instructions:[],
    });
    console.log("Your signature for retrieve fees is ", tx);
    await delay(10);
    }
    )
  });
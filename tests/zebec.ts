import * as anchor from '@project-serum/anchor';
import { assert } from "chai";
import * as spl from '@solana/spl-token'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getTokenBalance,createMint,createUserAndAssociatedWallet,feeVault,create_fee_account,zebecVault,withdrawData } from './src/Accounts';
import { PREFIX_TOKEN } from './src/Constants';
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider)
  const programId = new anchor.web3.PublicKey("3svmYpJGih9yxkgqpExNdQZLKQ7Wu5SEjaVUbmbytUJg");
  const idl = JSON.parse(
    require("fs").readFileSync("./target/idl/zebec.json", "utf8")
  );
  const program = new anchor.Program(idl, programId);
  //constant strings
  const OPERATE="NewVaultOption";
  const OPERATEDATA="NewVaultOptionData";
  //data account
  const dataAccount = anchor.web3.Keypair.generate();
  //token mint
  const tokenMint = new anchor.web3.Keypair();
  //users account
  const sender =  anchor.web3.Keypair.generate();
  const receiver =  anchor.web3.Keypair.generate();
  const fee_receiver = new anchor.web3.Keypair();
  let startTime:anchor.BN; 
  let endTime:anchor.BN;
  const amount=new anchor.BN(1000000)
  async function airdrop_sol(wallet_address: PublicKey){
      const signature = program.provider.connection.requestAirdrop(wallet_address, LAMPORTS_PER_SOL)
      const tx = await program.provider.connection.confirmTransaction(await signature);
      console.log("Your transaction signature", signature);
  }
  describe('zebec token', () => {
    it('Airdrop Solana', async()=>{
      await airdrop_sol(sender.publicKey)
      await airdrop_sol(receiver.publicKey)
      await airdrop_sol(fee_receiver.publicKey)
    })
    it('Create Set Vault',async()=>
    {
      //for 0.25 % fee percentage should be sent 25
      //which is divided by 10000 to get 0.25%
      const fee_percentage=new anchor.BN(25)      
      const tx = await program.rpc.createFeeAccount(fee_percentage,{
        accounts:{
          feeVault: await feeVault(fee_receiver.publicKey),
          createVaultData: await create_fee_account(fee_receiver.publicKey),
          owner: fee_receiver.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers:[fee_receiver],
        instructions:[],
    });
    console.log("Your signature for create vault is ", tx);
    
    const data_create_set = await program.account.createVault.fetch(
      await create_fee_account(fee_receiver.publicKey)
    );    
    assert.equal(data_create_set.vaultAddress.toString(),(await feeVault(fee_receiver.publicKey)).toString());
    assert.equal(data_create_set.owner.toString(),fee_receiver.publicKey.toString());
    assert.equal(data_create_set.feePercentage.toString(),fee_percentage.toString());
    })
    it('Token Deposit',async()=>{
      await createMint(provider,tokenMint);
      const source_token_account = await createUserAndAssociatedWallet(provider,sender,tokenMint.publicKey)
      const pda_token_account =await spl.getAssociatedTokenAddress(
          tokenMint.publicKey,
          await zebecVault(sender.publicKey),
          true,
          spl.TOKEN_PROGRAM_ID,
          spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      )
      const amount=new anchor.BN(1000000)  
      const tx = await program.rpc.depositToken(amount,{
        accounts:{
          zebecVault:await zebecVault(sender.publicKey),
          sourceAccount: sender.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram:spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram:spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
          mint:tokenMint.publicKey,
          sourceAccountTokenAccount:source_token_account,
          pdaAccountTokenAccount:pda_token_account
        },
        signers:[sender,],
        instructions:[],
    });
    console.log("Your transaction for deposit token signature", tx);
    const tokenbalance = await getTokenBalance(provider.connection,pda_token_account);
    assert.equal(tokenbalance.toString(),amount.toString());
    })
    it('Token Stream',async()=>{  
      let now = Math.floor(new Date().getTime() / 1000)
      startTime = new anchor.BN(now-1000) 
      endTime=new anchor.BN(now+2000)
      const dataSize = 8+8+8+8+8+32+32+8+8+32+200
      const tx = await program.rpc.tokenStream(startTime,endTime,amount,{
        accounts:{
          dataAccount: dataAccount.publicKey,
          withdrawData: await withdrawData(PREFIX_TOKEN,sender.publicKey,tokenMint.publicKey),
          feeOwner:fee_receiver.publicKey,
          createVaultData:await create_fee_account(fee_receiver.publicKey),
          feeVault:await feeVault(fee_receiver.publicKey),
          sourceAccount: sender.publicKey,
          destAccount:receiver.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram:spl.TOKEN_PROGRAM_ID,
          mint:tokenMint.publicKey,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        instructions:[
          await program.account.streamToken.createInstruction(
            dataAccount,
            dataSize
            ),
        ],
        signers:[sender,dataAccount],
    });
    console.log("Your transaction for token stream signature", tx);
    const data_account = await program.account.streamToken.fetch(
      dataAccount.publicKey
    );
    
    assert.equal(data_account.startTime.toString(),startTime.toString());
    assert.equal(data_account.endTime.toString(),endTime.toString());
    assert.equal(data_account.amount.toString(),amount.toString());
    assert.equal(data_account.sender.toString(),sender.publicKey.toString());
    assert.equal(data_account.receiver.toString(),receiver.publicKey.toString());
    assert.equal(data_account.paused.toString(),"0");   

    const withdraw_info = await program.account.tokenWithdraw.fetch(
      await withdrawData(PREFIX_TOKEN,sender.publicKey,tokenMint.publicKey)
    );
    assert.equal(withdraw_info.amount.toString(),amount.toString());
    })
    it('Withdraw Token Stream',async()=>{
      const pda_token_account =await spl.getAssociatedTokenAddress(
          tokenMint.publicKey,
          await zebecVault(sender.publicKey),
          true,
          spl.TOKEN_PROGRAM_ID,
          spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      )
      const dest_token_account =await spl.getAssociatedTokenAddress(
        tokenMint.publicKey,
        receiver.publicKey,
        true,
        spl.TOKEN_PROGRAM_ID,
        spl.ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    const fee_token_account =await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      await feeVault(fee_receiver.publicKey),
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    let now =new anchor.BN( Math.floor(new Date().getTime() / 1000))
      const tx = await program.rpc.withdrawTokenStream({
        accounts:{
          destAccount:receiver.publicKey,
          sourceAccount: sender.publicKey,
          feeOwner:fee_receiver.publicKey,
          createVaultData:await create_fee_account(fee_receiver.publicKey),
          feeVault:await feeVault(fee_receiver.publicKey),
          zebecVault:await zebecVault(sender.publicKey),
          dataAccount:dataAccount.publicKey,
          withdrawData:await withdrawData(PREFIX_TOKEN,sender.publicKey,tokenMint.publicKey),     
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram:spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram:spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
          mint:tokenMint.publicKey,
          pdaAccountTokenAccount:pda_token_account,
          destTokenAccount:dest_token_account,
          feeRecieverTokenAccount:fee_token_account,
        },
        signers:[receiver,],
    });
    console.log("Your signature for withdraw token stream is ", tx);
    const data_account = await program.account.streamToken.fetch(
      dataAccount.publicKey
    );
    if  (data_account.paused.toString() == "1")
    {
    let withdraw_amt = await getTokenBalance(provider.connection,fee_token_account)+await getTokenBalance(provider.connection,dest_token_account);
    assert.equal(data_account.withdrawLimit.toString(),withdraw_amt.toString()); 
    }
    if  (data_account.paused.toString() != "1" && now>endTime)  
    {
    //paused 
    let balance1 = await getTokenBalance(provider.connection,fee_token_account);
    let balance2 =await getTokenBalance(provider.connection,dest_token_account);
    let withdraw_amt= balance1+balance2;
    let  withdrawn_amount = data_account.amount
    assert.equal( withdrawn_amount.toString(),withdraw_amt.toString()); 
    }
    if  (data_account.paused.toString() != "1" && now<endTime)  
    {
    let balance1 = await getTokenBalance(provider.connection,fee_token_account);
    let balance2 =await getTokenBalance(provider.connection,dest_token_account);
    let withdraw_amt= balance1+balance2;
    let withdrawn_amount = data_account.withdrawn
    assert.equal( withdrawn_amount.toString(),withdraw_amt.toString()); 
    } 
    })
    it('Pause Stream Token', async () => {
      const tx = await program.rpc.pauseResumeTokenStream({
        accounts:{
          sender: sender.publicKey,
          receiver:receiver.publicKey,
          dataAccount:dataAccount.publicKey,
        },
        signers:[sender],
        instructions:[
        ],
      });

      console.log("Your transaction for pause token stream signature", tx);
      const data_account = await program.account.streamToken.fetch(
        dataAccount.publicKey
      );
      assert.equal(data_account.paused.toString(),"1");  
    });
    it('Resume Stream Token', async () => {
      const tx = await program.rpc.pauseResumeTokenStream({
        accounts:{
          sender: sender.publicKey,
          receiver:receiver.publicKey,
          dataAccount:dataAccount.publicKey,
        },
        signers:[sender],
        instructions:[
        ],
      });
      console.log("Your transaction for resume token stream signature", tx);
      const data_account = await program.account.streamToken.fetch(
        dataAccount.publicKey
      );
      assert.equal(data_account.paused.toString(),"0");
    });
    it('Withdraw Token Stream',async()=>{
      const pda_token_account =await spl.getAssociatedTokenAddress(
          tokenMint.publicKey,
          await zebecVault(sender.publicKey),
          true,
          spl.TOKEN_PROGRAM_ID,
          spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      )
      const dest_token_account =await spl.getAssociatedTokenAddress(
        tokenMint.publicKey,
        receiver.publicKey,
        true,
        spl.TOKEN_PROGRAM_ID,
        spl.ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    const fee_token_account =await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      await feeVault(fee_receiver.publicKey),
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID,
    )
    let now =new anchor.BN( Math.floor(new Date().getTime() / 1000))
      const tx = await program.rpc.withdrawTokenStream({
        accounts:{
          destAccount:receiver.publicKey,
          sourceAccount: sender.publicKey,
          feeOwner:fee_receiver.publicKey,
          createVaultData:await create_fee_account(fee_receiver.publicKey),
          feeVault:await feeVault(fee_receiver.publicKey),
          zebecVault:await zebecVault(sender.publicKey),
          dataAccount:dataAccount.publicKey,
          withdrawData:await withdrawData(PREFIX_TOKEN,sender.publicKey,tokenMint.publicKey),     
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram:spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram:spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
          mint:tokenMint.publicKey,
          pdaAccountTokenAccount:pda_token_account,
          destTokenAccount:dest_token_account,
          feeRecieverTokenAccount:fee_token_account,
        },
        signers:[receiver,],
    });
    console.log("Your signature for withdraw token stream is ", tx);
    const data_account = await program.account.streamToken.fetch(
      dataAccount.publicKey
    );
    if  (data_account.paused.toString() == "1")
    {
    let withdraw_amt = await getTokenBalance(provider.connection,fee_token_account)+await getTokenBalance(provider.connection,dest_token_account);
    assert.equal(data_account.withdrawLimit.toString(),withdraw_amt.toString()); 
    }
    if  (data_account.paused.toString() != "1" && now>endTime)  
    {
    //paused 
    let balance1 = await getTokenBalance(provider.connection,fee_token_account);
    let balance2 =await getTokenBalance(provider.connection,dest_token_account);
    let withdraw_amt= balance1+balance2;
    let  withdrawn_amount = data_account.amount
    assert.equal( withdrawn_amount.toString(),withdraw_amt.toString()); 
    }
    if  (data_account.paused.toString() != "1" && now<endTime)  
    {
    let balance1 = await getTokenBalance(provider.connection,fee_token_account);
    let balance2 =await getTokenBalance(provider.connection,dest_token_account);
    let withdraw_amt= balance1+balance2;
    let  withdrawn_amount = data_account.withdrawn
    assert.equal( withdrawn_amount.toString(),withdraw_amt.toString()); 
    } 
    })
    it('Retrieve Fees',async()=>{
      const [fee_vault ,_un]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
      anchor.utils.bytes.utf8.encode(OPERATE),], program.programId)
      const [create_fee_account ,_]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
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
          createVaultData: create_fee_account,
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
    })     
  });
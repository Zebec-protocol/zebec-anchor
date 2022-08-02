import * as anchor from '@project-serum/anchor';
import { assert } from "chai";
import * as spl from '@solana/spl-token'
import { PublicKey} from "@solana/web3.js";
import { airdropSol,solFromProvider,getClusterTime } from './src/utils';
import { getTokenBalance,createMint,createUserAndAssociatedWallet,feeVault,create_fee_account,zebecVault,withdrawData } from './src/Accounts';
import { PREFIX_TOKEN,STREAM_TOKEN_SIZE } from './src/Constants';
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider)
  const programId = new anchor.web3.PublicKey("Gvg5iMmgu8zs4rn5zJ6YGGnzsu6WqZJawKUndbqneXia");
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
  describe('zebec token', () => {
    it('Airdrop Solana', async()=>{
      await solFromProvider(program.provider,sender.publicKey,3);
      await solFromProvider(program.provider,receiver.publicKey,1);
      await solFromProvider(program.provider,fee_receiver.publicKey,1);
    })
    it('Create Set Vault',async()=>
    {
      //for 0.25 % fee percentage should be sent 25
      //which is divided by 10000 to get 0.25%
      const fee_percentage=new anchor.BN(25)    
      const tx = await program.rpc.createFeeAccount(fee_percentage,{
        accounts:{
          feeVault: await feeVault(fee_receiver.publicKey),
          vaultData: await create_fee_account(fee_receiver.publicKey),
          owner: fee_receiver.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers:[fee_receiver],
        instructions:[],
    });
    console.log("Your signature for create vault is ", tx);
    
    const data_create_set = await program.account.vault.fetch(
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
      const amount=new anchor.BN(5000000)  
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
      let now = await getClusterTime(provider.connection)
      startTime = new anchor.BN(now+100) 
      endTime=new anchor.BN(now+200)
      const amount=new anchor.BN(4000000)
      const can_cancel= true
      const can_update =true;
      const dataSize = STREAM_TOKEN_SIZE
      const tx = await program.rpc.tokenStream(startTime,endTime,amount,can_cancel,can_update,{
        accounts:{
          dataAccount: dataAccount.publicKey,
          withdrawData: await withdrawData(PREFIX_TOKEN,sender.publicKey,tokenMint.publicKey),
          feeOwner:fee_receiver.publicKey,
          vaultData:await create_fee_account(fee_receiver.publicKey),
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
    it('Token Stream Update',async()=>{  
      let now = await getClusterTime(provider.connection)
      startTime = new anchor.BN(now-20) 
      endTime=new anchor.BN(now+10)
      const amount=new anchor.BN(4000000)
      const tx = await program.rpc.tokenStreamUpdate(startTime,endTime,amount,{
        accounts:{
          dataAccount: dataAccount.publicKey,
          withdrawData: await withdrawData(PREFIX_TOKEN,sender.publicKey,tokenMint.publicKey),
          sourceAccount: sender.publicKey,
          destAccount:receiver.publicKey,
          mint:tokenMint.publicKey,
        },

        signers:[sender,],
    });
    console.log("Your transaction for token stream update signature", tx);
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
          vaultData:await create_fee_account(fee_receiver.publicKey),
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
          feeReceiverTokenAccount:fee_token_account,
        },
        signers:[receiver,],
    });
    console.log("Your signature for withdraw token stream is ", tx);
    const data_account = await program.account.streamToken.fetch(
      dataAccount.publicKey
    );
    let withdraw_amt = await getTokenBalance(provider.connection,fee_token_account)+await getTokenBalance(provider.connection,dest_token_account);
    if  (data_account.paused == 1 && now<endTime)
    {
    assert.equal(data_account.withdrawLimit.toString(),withdraw_amt.toString()); 
    }
    if  (data_account.paused != 1 && now>endTime)  
    {
    let  withdrawn_amount = data_account.amount
    assert.equal( withdrawn_amount.toString(),withdraw_amt.toString()); 
    }
    if  (data_account.paused != 1 && now<endTime)  
    {
    let withdrawn_amount = data_account.withdrawn
    assert.equal( withdrawn_amount.toString(),withdraw_amt.toString()); 
    } 
    })
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
    it('Instant Token Transfer',async()=>{
      const zebec_vault =await zebecVault(sender.publicKey);
      const amount=new anchor.BN(1000000) 
      const pda_token_account =await spl.getAssociatedTokenAddress(
        tokenMint.publicKey,
        zebec_vault,
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
      const tx = await program.rpc.instantTokenTransfer(amount,{
        accounts:{
          zebecVault: zebec_vault,
          destAccount:receiver.publicKey,
          sourceAccount: sender.publicKey,
          withdrawData:await withdrawData(PREFIX_TOKEN,sender.publicKey,tokenMint.publicKey),     
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram:spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram:spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
          mint:tokenMint.publicKey,
          pdaAccountTokenAccount:pda_token_account,
          destTokenAccount:dest_token_account,
        },
        signers:[sender,],
      });
      console.log("Your signature for instant transfer is ", tx);
    });
    it("Cancel Token Stream", async () => {
     const pda_token_account = await spl.getAssociatedTokenAddress(
        tokenMint.publicKey,
        await zebecVault(sender.publicKey),
        true,
        spl.TOKEN_PROGRAM_ID,
        spl.ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const dest_token_account = await spl.getAssociatedTokenAddress(
        tokenMint.publicKey,
        receiver.publicKey,
        true,
        spl.TOKEN_PROGRAM_ID,
        spl.ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const fee_token_account = await spl.getAssociatedTokenAddress(
        tokenMint.publicKey,
        await feeVault(fee_receiver.publicKey),
        true,
        spl.TOKEN_PROGRAM_ID,
        spl.ASSOCIATED_TOKEN_PROGRAM_ID
      );
        const tx = await program.rpc.cancelTokenStream({
          accounts: {
            destAccount: receiver.publicKey,
            sourceAccount: sender.publicKey,
            feeOwner: fee_receiver.publicKey,
            vaultData: await create_fee_account(fee_receiver.publicKey),
            feeVault:await feeVault(fee_receiver.publicKey),
            zebecVault:await zebecVault(sender.publicKey),
            dataAccount: dataAccount.publicKey,
            withdrawData:await withdrawData(PREFIX_TOKEN,sender.publicKey,tokenMint.publicKey),
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: spl.TOKEN_PROGRAM_ID,
            associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            mint: tokenMint.publicKey,
            pdaAccountTokenAccount: pda_token_account,
            destTokenAccount: dest_token_account,
            feeReceiverTokenAccount: fee_token_account,
          },
          signers: [sender],
        });
        console.log("Your signature for cancel token stream is ", tx);
    });
    it("Initializer Token Withdrawal", async () => {
      const source_token_account = await spl.getAssociatedTokenAddress(
        tokenMint.publicKey,
        sender.publicKey,
        true,
        spl.TOKEN_PROGRAM_ID,
        spl.ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const pda_token_account =await spl.getAssociatedTokenAddress(
        tokenMint.publicKey,
        await zebecVault(sender.publicKey),
        true,
        spl.TOKEN_PROGRAM_ID,
        spl.ASSOCIATED_TOKEN_PROGRAM_ID,
    )
      const amount = new anchor.BN(500);
      const tx = await program.rpc.tokenWithdrawal(amount, {
        accounts: {
          zebecVault: await zebecVault(sender.publicKey),
          withdrawData:await withdrawData(PREFIX_TOKEN,sender.publicKey,tokenMint.publicKey),     
          sourceAccount: sender.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          mint: tokenMint.publicKey,
          sourceAccountTokenAccount: source_token_account,
          pdaAccountTokenAccount: pda_token_account,
        },
        signers: [sender],
        instructions: [],
      });
      console.log("Your transaction signature for token withdrawal", tx);
    });
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
          vaultData: create_fee_account,
          feeVault: fee_vault,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram:spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram:spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          rent:anchor.web3.SYSVAR_RENT_PUBKEY,
          mint:tokenMint.publicKey,
          feeReceiverVaultTokenAccount:fee_vault_token_account,
          feeOwnerTokenAccount:fee_owner_token_account,
        },
        signers:[fee_receiver],
        instructions:[],
    });
    console.log("Your signature for retrieve fees is ", tx);
    })      
  });
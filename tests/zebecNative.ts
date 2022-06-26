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
    
  async function airdrop_sol(wallet_address: PublicKey){
      const signature = program.provider.connection.requestAirdrop(wallet_address, LAMPORTS_PER_SOL)
      const tx = await program.provider.connection.confirmTransaction(await signature);
      console.log("Your transaction signature", signature);
  }
  function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
describe('zebec native', () => {
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
  });
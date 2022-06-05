import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Zebec } from '../target/types/zebec';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
describe('zebec', () => {

  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.local());
  const programId = new anchor.web3.PublicKey("3svmYpJGih9yxkgqpExNdQZLKQ7Wu5SEjaVUbmbytUJg");
  const idl = JSON.parse(
    require("fs").readFileSync("./target/idl/zebec.json", "utf8")
  );

  const program = new anchor.Program(idl, programId);
  const PREFIX = "withdraw_sol"
  const PREFIXMULTISIG = "withdraw_multisig_sol";

  const sender = anchor.web3.Keypair.generate();
  const pda = anchor.web3.Keypair.generate();
  const receiver = anchor.web3.Keypair.generate();
    
  console.log("Sender key: "+sender.publicKey.toBase58())
  console.log("Receiver key: "+receiver.publicKey.toBase58())
  console.log("Pda key: "+pda.publicKey.toBase58())


  function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
  it('Airdrop Solana', async()=>{
    const signature = program.provider.connection.requestAirdrop(sender.publicKey, LAMPORTS_PER_SOL)
    const tx = await program.provider.connection.confirmTransaction(await signature);
    const signatures = program.provider.connection.requestAirdrop(receiver.publicKey, LAMPORTS_PER_SOL)
    const txs = await program.provider.connection.confirmTransaction(await signatures);
    console.log("Your transaction signature", signature);
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
        pda: pda.publicKey,
        withdrawData: withdraw_data,
        systemProgram: anchor.web3.SystemProgram.programId,
        sender: sender.publicKey,
        receiver:receiver.publicKey
      },
      signers:[sender,pda],
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
        pda:pda.publicKey,
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
        pda:pda.publicKey,
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
        pda:pda.publicKey,
      },
      signers:[sender],
      instructions:[
      ],
    });
    console.log("Your transaction signature", tx);
  });
  it('Create Multisig', async () => {
    const [withdraw_data, _]= await PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode(PREFIX),sender.publicKey.toBuffer()], program.programId
    )
    const [zebecVault, bumps]= await PublicKey.findProgramAddress([
      sender.publicKey.toBuffer()], program.programId
    )
    const pda = anchor.web3.Keypair.generate();

    const [multisig_safe, _bumps]= await PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode(PREFIXMULTISIG),
      pda.publicKey.toBuffer()], program.programId
    )
    
    const multisigSize = 392; 
    const signers = [sender.publicKey,receiver.publicKey,anchor.web3.Keypair.generate().publicKey]
    const tx = await program.rpc.createMultisig(signers,new anchor.BN(2),{
      accounts:{
        multisigSafe:multisig_safe,
        sender: sender.publicKey,
        pda:pda.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers:[sender,pda],
      instructions:[
      ],
    });
    console.log("Your transaction signature", tx);
  });
});

import * as anchor from '@project-serum/anchor';
import { feeVault,create_fee_account,zebecVault,withdrawData } from './src/Accounts';
import { airdropDelay, airdropSol,getClusterTime } from './src/utils';
import {PREFIX} from './src/Constants'
// Configure the client to use the local cluster.
const provider = anchor.Provider.env();
anchor.setProvider(provider)
const programId = new anchor.web3.PublicKey("3svmYpJGih9yxkgqpExNdQZLKQ7Wu5SEjaVUbmbytUJg");
const idl = JSON.parse(
  require("fs").readFileSync("./target/idl/zebec.json", "utf8")
);
const program = new anchor.Program(idl, programId);
let dataAccount = anchor.web3.Keypair.generate();

//user accounts
const sender = anchor.web3.Keypair.generate();
const receiver = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();

console.log("Sender key: "+sender.publicKey.toBase58())
console.log("Receiver key: "+receiver.publicKey.toBase58())
console.log("DataAccount key: "+dataAccount.publicKey.toBase58())

describe('zebec native', () => {
  it('Airdrop Solana', async()=>{
    await airdropSol(program.provider.connection,sender.publicKey)
    await airdropSol(program.provider.connection,sender.publicKey)
    await airdropSol(program.provider.connection,fee_receiver.publicKey)
  })
  it('Create Set Vault',async()=>{
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
  console.log("Your transaction signature is ", tx);
  }
  )
  it('Deposit Sol', async () => {
    const amount=new anchor.BN(anchor.web3.LAMPORTS_PER_SOL)
    const tx = await program.rpc.depositSol(amount,{
      accounts:{
        zebecVault: await zebecVault(sender.publicKey),
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
    const startTime = new anchor.BN(await getClusterTime(provider.connection)) 
    const endTime=new anchor.BN(await getClusterTime(provider.connection)+10)
    const amount=new anchor.BN(anchor.web3.LAMPORTS_PER_SOL)
    const dataSize = 8+8+8+8+8+32+32+8+8+32+200
    const tx = await program.rpc.nativeStream(startTime,endTime,amount,{
      accounts:{
        dataAccount: dataAccount.publicKey,
        withdrawData: await withdrawData(PREFIX,sender.publicKey),
        feeOwner:fee_receiver.publicKey,
        createVaultData:await create_fee_account(fee_receiver.publicKey),
        feeVault:await feeVault(fee_receiver.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
        sender: sender.publicKey,
        receiver:receiver.publicKey
      },
      instructions:[
        await program.account.stream.createInstruction(
          dataAccount,
          dataSize
          ),
      ],
      signers:[sender,dataAccount],
    });
    await airdropDelay(10000);
    console.log("Your transaction signature", tx);
  });
  it('Withdraw Sol', async () => {
    const tx = await program.rpc.withdrawStream({
      accounts:{
        zebecVault: await zebecVault(sender.publicKey),
        sender: sender.publicKey,
        receiver:receiver.publicKey,
        dataAccount:dataAccount.publicKey,
        withdrawData:await withdrawData(PREFIX,sender.publicKey),
        feeOwner:fee_receiver.publicKey,
        createVaultData:await create_fee_account(fee_receiver.publicKey),
        feeVault:await feeVault(fee_receiver.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers:[receiver],
    });
    console.log("Your transaction signature", tx);
  });
  it('Pause Stream', async () => {
    await airdropDelay(1000000)
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
  it('Instant Transfer', async () => {
    const amount =new anchor.BN(25);
    const tx = await program.rpc.instantNativeTransfer(amount,{
      accounts:{
        zebecVault: await zebecVault(sender.publicKey),
        sender: sender.publicKey,
        receiver:receiver.publicKey,
        withdrawData:await withdrawData(PREFIX,sender.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers:[sender],
    });
    console.log("Your transaction signature", tx);
  });
  it("Cancel Sol Stream", async () => {
      const tx = await program.rpc.cancelStream({
        accounts: {
          zebecVault: await zebecVault(sender.publicKey),
          sender: sender.publicKey,
          receiver: receiver.publicKey,
          dataAccount: dataAccount.publicKey,
          withdrawData:await withdrawData(PREFIX,sender.publicKey),
          feeOwner: fee_receiver.publicKey,
          createVaultData:await create_fee_account(fee_receiver.publicKey),
          feeVault:await feeVault(fee_receiver.publicKey),
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [sender],
      });
      console.log("Your transaction signature", tx);
  });
  it("Initializer Withdrawal Sol", async () => {
    const amount = new anchor.BN(100);
    const tx = await program.rpc.nativeWithdrawal(amount, {
      accounts: {
        zebecVault: await zebecVault(sender.publicKey),
        withdrawData: await withdrawData(PREFIX,sender.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
        sender: sender.publicKey,
      },
      signers: [sender],
    });
    console.log("Your transaction signature", tx);
  });
  it('Retrieve Fees',async()=>{
    const tx = await program.rpc.withdrawFeesSol({
      accounts:{
        feeOwner: fee_receiver.publicKey,
        createVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
        rent:anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers:[fee_receiver],
      instructions:[],
  });
  console.log("Your transaction signature is ", tx);
  }
  )
  });
import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Zebec } from '../target/types/zebec';
import * as spl from '@solana/spl-token'
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
// Configure the client to use the local cluster.
const provider = anchor.Provider.env();
anchor.setProvider(provider)
// Program details
const programId = new anchor.web3.PublicKey("3svmYpJGih9yxkgqpExNdQZLKQ7Wu5SEjaVUbmbytUJg");
const idl = JSON.parse(
require("fs").readFileSync("./target/idl/zebec.json", "utf8")
);
const program = anchor.workspace.SerumMultisig;
const programZebec = new anchor.Program(idl, programId);
const pid = programZebec.programId

// Accounts
const multisig = anchor.web3.Keypair.generate();
const ownerA = anchor.web3.Keypair.generate();
const ownerB = anchor.web3.Keypair.generate();
const ownerC = anchor.web3.Keypair.generate();
const ownerD = anchor.web3.Keypair.generate();
const owners = [ownerA.publicKey, ownerB.publicKey, ownerC.publicKey];

//Zebec program accounts
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

//Functions
async function airdrop_sol(wallet_address: PublicKey){
    const signature = program.provider.connection.requestAirdrop(wallet_address, LAMPORTS_PER_SOL)
    const tx = await program.provider.connection.confirmTransaction(await signature);
    console.log("Your transaction signature", signature);
}
function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}
describe("multisig", () => {
    it("Tests the multisig program", async () => {
        const multisigSize = 200;
        const threshold = new anchor.BN(2);
        const [multisigSigner, nonce] =
        await anchor.web3.PublicKey.findProgramAddress(
            [multisig.publicKey.toBuffer()],
            program.programId
        );
        await program.rpc.createMultisig(owners, threshold, nonce, {
        accounts: {
            multisig: multisig.publicKey,
        },
        instructions: [
            await program.account.multisig.createInstruction(
            multisig,
            multisigSize
            ),
        ],
        signers: [multisig],
        });
    })
    it('Airdrop Solana', async()=>{
        const [multisigSigner, nonce] =
        await anchor.web3.PublicKey.findProgramAddress(
            [multisig.publicKey.toBuffer()],
            program.programId
        );
        await airdrop_sol(sender.publicKey)
        await airdrop_sol(fee_receiver.publicKey)
        await airdrop_sol(ownerA.publicKey)
        await airdrop_sol(multisigSigner)

      })
    it('Create Set Vault',async()=>{
        const [fee_vault ,_un]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
        anchor.utils.bytes.utf8.encode(OPERATE),], programZebec.programId)
        const [create_set_data ,_]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
          anchor.utils.bytes.utf8.encode(OPERATEDATA),fee_vault.toBuffer()], programZebec.programId)
    
        const fee_percentage=new anchor.BN(25)
        const tx = await programZebec.rpc.createVault(fee_percentage,{
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
    })
    it('Deposit Sol', async () => {

        const [multisigSigner, nonce] =
        await anchor.web3.PublicKey.findProgramAddress(
            [multisig.publicKey.toBuffer()],
            program.programId
        );
        const [zebecVault, bumps]= await PublicKey.findProgramAddress([
            multisigSigner.toBuffer()], programZebec.programId
        )
        const pid = programZebec.programId
        const accounts = [
        {
            pubkey: zebecVault,
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey: multisigSigner,
            isWritable: true,
            isSigner: true,
        },
        {
            pubkey:anchor.web3.SystemProgram.programId,
            isWritable: false,
            isSigner: false,
        }
        ];
        const transaction = anchor.web3.Keypair.generate();
        const txSize = 1000; // Big enough, cuz I'm lazy.
         const data = programZebec.coder.instruction.encode("depositSol", {
            amount: new anchor.BN(1000000),
        });
        const tx = await program.rpc.createTransaction(pid, accounts, data, {
            accounts: {
                multisig: multisig.publicKey,
                transaction: transaction.publicKey,
                proposer: ownerA.publicKey,
            },
            instructions: [
                await program.account.transaction.createInstruction(
                transaction,
                txSize
                ),
            ],
            signers: [transaction, ownerA],
            });
        console.log("Multisig Deposit SOl Transaction created by ownerA", tx);
        const approveTx = await program.rpc.approve({
            accounts: {
              multisig: multisig.publicKey,
              transaction: transaction.publicKey,
              owner: ownerB.publicKey,
            },
            signers: [ownerB],
          });
        console.log("Multisig Deposit SOl Transaction Approved by ownerB", approveTx);


        await program.rpc.executeTransaction({
            accounts: {
              multisig: multisig.publicKey,
              multisigSigner,
              transaction: transaction.publicKey,
            },
            remainingAccounts: accounts
        .map((t: any) => {
          if (t.pubkey.equals(multisigSigner)) {
            return { ...t, isSigner: false };
          }
          return t;
        })
        .concat({
          pubkey: programZebec.programId,
          isWritable: false,
          isSigner: false,
        }),
        });
    })
    it("Creating stream from multisig", async () => {
        const [multisigSigner, nonce] =
        await anchor.web3.PublicKey.findProgramAddress(
            [multisig.publicKey.toBuffer()],
            program.programId
        );
        console.log("MultisigSigner "+multisigSigner.toBase58())
        const [zebecVault, bumps]= await PublicKey.findProgramAddress([
            multisigSigner.toBuffer()], programZebec.programId
        )
        const [withdraw_data, _]= await PublicKey.findProgramAddress([
            anchor.utils.bytes.utf8.encode(PREFIX),multisigSigner.toBuffer()], programZebec.programId
          )
        const [fee_vault ,_un]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
        anchor.utils.bytes.utf8.encode(OPERATE),], programZebec.programId)
        const [create_set_data ,_non]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
        anchor.utils.bytes.utf8.encode(OPERATEDATA),fee_vault.toBuffer()], programZebec.programId)

        const pid = programZebec.programId
        const accounts = [
        {
            pubkey: dataAccount.publicKey,
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey: withdraw_data,
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey: fee_receiver.publicKey,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey: create_set_data,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey: fee_vault,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey: multisigSigner,
            isWritable: true,
            isSigner: true,
        },
        {
            pubkey: receiver.publicKey,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey:anchor.web3.SystemProgram.programId,
            isWritable: false,
            isSigner: false,
        },
        ];
        let now = Math.floor(new Date().getTime() / 1000)
        const startTime = new anchor.BN(now-1000) 
        const endTime=new anchor.BN(now+3600)
        const amount=new anchor.BN(1000)
        const data = programZebec.coder.instruction.encode("nativeStream", {startTime:startTime,endTime:endTime,amount:amount});
        const txSize = 1000; // Big enough, cuz I'm lazy.
        const dataSize = 20+8+8+8+8+8+32+32+32+8+8+32

        const transaction = anchor.web3.Keypair.generate();
        const tx = await program.rpc.createTransaction(pid, accounts, data, {
            accounts: {
                multisig: multisig.publicKey,
                transaction: transaction.publicKey,
                proposer: ownerA.publicKey,
            },
            instructions: [
                await program.account.transaction.createInstruction(
                transaction,
                txSize
                ),
                await programZebec.account.stream.createInstruction(
                    dataAccount,
                    dataSize
                    ),
            ],
            signers: [transaction, ownerA,dataAccount],
            });
        console.log("Multisig Stream SOl Transaction created ", tx);
        const approveTx = await program.rpc.approve({
            accounts: {
              multisig: multisig.publicKey,
              transaction: transaction.publicKey,
              owner: ownerB.publicKey,
            },
            signers: [ownerB],
          });
        console.log("Multisig Stream SOl TransactionTransaction Approved by ownerB", approveTx);
        const exeTxn = await program.rpc.executeTransaction({
            accounts: {
              multisig: multisig.publicKey,
              multisigSigner,
              transaction: transaction.publicKey,
            },
            remainingAccounts: accounts
            .map((t: any) => {
            if (t.pubkey.equals(multisigSigner)) {
                return { ...t, isSigner: false };
            }
            return t;
            })
            .concat({
            pubkey: programZebec.programId,
            isWritable: false,
            isSigner: false,
            }),
        });
        console.log("Multisig Stream SOl TransactionTransaction  executed", exeTxn);
    })
    it("Pause stream from multisig", async () => {
        const [multisigSigner, nonce] =
        await anchor.web3.PublicKey.findProgramAddress(
            [multisig.publicKey.toBuffer()],
            program.programId
        );
        console.log(multisigSigner.toBase58())
        const accounts = [
        {
            pubkey: multisigSigner,
            isWritable: false,
            isSigner: true,
        },
        {
            pubkey: receiver.publicKey,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey: dataAccount.publicKey,
            isWritable: true,
            isSigner: false,
        },
        ];
        const transaction = anchor.web3.Keypair.generate();
        const txSize = 1000;
        const data = programZebec.coder.instruction.encode("pauseStream", {});
        const tx = await program.rpc.createTransaction(pid, accounts,data, {
            accounts: {
                multisig: multisig.publicKey,
                transaction: transaction.publicKey,
                proposer: ownerA.publicKey,
            },
            instructions: [
                await program.account.transaction.createInstruction(
                transaction,
                txSize
                ),
            ],
            signers: [transaction, ownerA],
            });
        console.log("Pause Stream SOl Transaction created ", tx);
        const approveTx = await program.rpc.approve({
            accounts: {
              multisig: multisig.publicKey,
              transaction: transaction.publicKey,
              owner: ownerB.publicKey,
            },
            signers: [ownerB],
          });
        console.log("Multisig Stream SOl Transaction Approved by ownerB", approveTx);
        // await delay(100000);
        const exeTxn = await program.rpc.executeTransaction({
            accounts: {
              multisig: multisig.publicKey,
              multisigSigner,
              transaction: transaction.publicKey,
            },
            remainingAccounts: accounts
            .map((t: any) => {
            if (t.pubkey.equals(multisigSigner)) {
                return { ...t, isSigner: false };
            }
            return t;
            })
            .concat({
            pubkey: programZebec.programId,
            isWritable: false,
            isSigner: false,
            }),
        });
        console.log("Multisig Stream SOl Transaction executed", exeTxn);

    })
    it("Resume stream from multisig", async () => {
        const [multisigSigner, nonce] =
        await anchor.web3.PublicKey.findProgramAddress(
            [multisig.publicKey.toBuffer()],
            program.programId
        );
        console.log(multisigSigner.toBase58())
        const accounts = [
        {
            pubkey: multisigSigner,
            isWritable: false,
            isSigner: true,
        },
        {
            pubkey: receiver.publicKey,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey: dataAccount.publicKey,
            isWritable: true,
            isSigner: false,
        },
        ];
        const transaction = anchor.web3.Keypair.generate();
        const txSize = 1000;
        const data = programZebec.coder.instruction.encode("pauseStream", {});
        const tx = await program.rpc.createTransaction(pid, accounts,data, {
            accounts: {
                multisig: multisig.publicKey,
                transaction: transaction.publicKey,
                proposer: ownerA.publicKey,
            },
            instructions: [
                await program.account.transaction.createInstruction(
                transaction,
                txSize
                ),
            ],
            signers: [transaction, ownerA],
            });
        console.log("Resume Stream SOl Transaction created ", tx);
        const approveTx = await program.rpc.approve({
            accounts: {
              multisig: multisig.publicKey,
              transaction: transaction.publicKey,
              owner: ownerB.publicKey,
            },
            signers: [ownerB],
          });
        console.log("Resume Stream SOl TransactionTransaction Approved by ownerB", approveTx);
        // await delay(100000);
       const exeTxn = await program.rpc.executeTransaction({
            accounts: {
              multisig: multisig.publicKey,
              multisigSigner,
              transaction: transaction.publicKey,
            },
            remainingAccounts: accounts
            .map((t: any) => {
            if (t.pubkey.equals(multisigSigner)) {
                return { ...t, isSigner: false };
            }
            return t;
            })
            .concat({
            pubkey: programZebec.programId,
            isWritable: false,
            isSigner: false,
            }),
        });
        console.log("Resume Stream SOl Transaction executed", exeTxn);

    })


})
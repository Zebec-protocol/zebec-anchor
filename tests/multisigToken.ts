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
const PREFIX_TOKEN= "withdraw_token"
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

async function airdrop_sol(wallet_address: PublicKey){
    const signature = program.provider.connection.requestAirdrop(wallet_address, LAMPORTS_PER_SOL)
    const tx = await program.provider.connection.confirmTransaction(await signature);
    console.log("Your transaction signature", signature);
}
async function getTokenBalance(tokenAccount:anchor.web3.PublicKey):Promise<bigint | undefined> {
    const tokenAccountInfo = await provider.connection.getAccountInfo(
        tokenAccount
    );
    const data = Buffer.from(tokenAccountInfo.data);
    const accountInfo = spl.AccountLayout.decode(data);
    return accountInfo.amount;
}
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
  console.log(`Created new mint account at ${signature}`);
  return tokenMint.publicKey;
}
const createUserAndAssociatedWallet = async (connection: anchor.web3.Connection, mint?: anchor.web3.PublicKey): Promise<anchor.web3.PublicKey | undefined> => {
  let userAssociatedTokenAccount: anchor.web3.PublicKey | undefined = undefined;
  // Fund sender with some SOL
  let txFund = new anchor.web3.Transaction();
  txFund.add(anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: sender.publicKey,
      lamports: 5 * anchor.web3.LAMPORTS_PER_SOL,
  }));
  const sigTxFund = await provider.send(txFund);
  console.log(`Funded new account with 5 SOL: ${sigTxFund}`);
  if (mint) {
    const [multisigSigner, nonce] =
        await anchor.web3.PublicKey.findProgramAddress(
            [multisig.publicKey.toBuffer()],
            program.programId
        );       
      // Create a token account for the sender and mint some tokens
      userAssociatedTokenAccount = await spl.getAssociatedTokenAddress(
          mint,
          multisigSigner,
          true,
          spl.TOKEN_PROGRAM_ID,
          spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      )
      const txFundTokenAccount = new anchor.web3.Transaction();
      txFundTokenAccount.add(spl.createAssociatedTokenAccountInstruction(
          sender.publicKey,
          userAssociatedTokenAccount,
          multisigSigner,
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
      try {
        const txFundTokenSig = await provider.send(txFundTokenAccount, [sender]);
        await delay(1000)
        console.log(`New associated account for mint ${mint.toBase58()}: ${txFundTokenSig}`);
      } catch (error) {
        console.log(error)
      }
    }
    return userAssociatedTokenAccount;
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
        await airdrop_sol(receiver.publicKey)
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
    it('Deposit token', async () => {
        const [multisigSigner, nonce] =
        await anchor.web3.PublicKey.findProgramAddress(
            [multisig.publicKey.toBuffer()],
            program.programId
        );        
        const pid = programZebec.programId
        // console.log(await createUserAndAssociatedWallet(await program.provider.connection,tokenMint.publicKey))
        createMint(program.provider.connection)        
        const source_token_account = await createUserAndAssociatedWallet(program.provider.connection,tokenMint.publicKey)

        const [zebecVault, _]= await PublicKey.findProgramAddress([
            multisigSigner.toBuffer(),], pid);
        const pda_token_account =await spl.getAssociatedTokenAddress(
            tokenMint.publicKey,
            zebecVault,
            true,
            spl.TOKEN_PROGRAM_ID,
            spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        )
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
            pubkey: anchor.web3.SystemProgram.programId,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey:spl.TOKEN_PROGRAM_ID,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey:spl.ASSOCIATED_TOKEN_PROGRAM_ID,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey:anchor.web3.SYSVAR_RENT_PUBKEY,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey:tokenMint.publicKey,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey:source_token_account,
            isWritable: true,
            isSigner: false,
        },
        {
            pubkey:pda_token_account,
            isWritable: true,
            isSigner: false,
        },
        ];
        const transaction = anchor.web3.Keypair.generate();
        const txSize = 1000; // Big enough, cuz I'm lazy.
         const data = programZebec.coder.instruction.encode("depositToken", {
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
        console.log("Multisig Deposit Token Transaction Approved by ownerB", approveTx);


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
        const [withdraw_data, _]= await PublicKey.findProgramAddress([
            anchor.utils.bytes.utf8.encode(PREFIX_TOKEN),multisigSigner.toBuffer(),tokenMint.publicKey.toBuffer()], pid)
        const [fee_vault ,_un]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
            anchor.utils.bytes.utf8.encode(OPERATE),], pid)
        const [create_set_data ,_non]= await PublicKey.findProgramAddress([fee_receiver.publicKey.toBuffer(),
            anchor.utils.bytes.utf8.encode(OPERATEDATA),fee_vault.toBuffer()], pid)
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
        {
            pubkey:spl.TOKEN_PROGRAM_ID,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey:tokenMint.publicKey,
            isWritable: false,
            isSigner: false,
        },
        {
            pubkey:anchor.web3.SYSVAR_RENT_PUBKEY,
            isWritable: false,
            isSigner: false,
        },
        ];
        let now = Math.floor(new Date().getTime() / 1000)
        const startTime = new anchor.BN(now-1000) 
        const endTime=new anchor.BN(now+2000)
        const dataSize = 8+8+8+8+8+32+32+8+8+32+200
        const amount=new anchor.BN(1000000)  
        const data = programZebec.coder.instruction.encode("tokenStream", {startTime:startTime,endTime:endTime,amount:amount});
        const txSize = 1000;
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
                await programZebec.account.streamToken.createInstruction(
                    dataAccount,
                    dataSize
                    ),
            ],
            signers: [transaction, ownerA,dataAccount],
            });
        console.log("Multisig Stream Token Transaction created ", tx);
        const approveTx = await program.rpc.approve({
            accounts: {
              multisig: multisig.publicKey,
              transaction: transaction.publicKey,
              owner: ownerB.publicKey,
            },
            signers: [ownerB],
          });
        console.log("Multisig Stream Token TransactionTransaction Approved by ownerB", approveTx);
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
        console.log("Multisig Stream Token TransactionTransaction  executed", exeTxn);
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
        const data = programZebec.coder.instruction.encode("pauseResumeTokenStream", {});
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
        console.log("Pause Stream Token Transaction created ", tx);
        const approveTx = await program.rpc.approve({
            accounts: {
              multisig: multisig.publicKey,
              transaction: transaction.publicKey,
              owner: ownerB.publicKey,
            },
            signers: [ownerB],
          });
        console.log("Multisig Stream Token Transaction Approved by ownerB", approveTx);
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
        console.log("Multisig Stream Token Transaction executed", exeTxn);

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
        const data = programZebec.coder.instruction.encode("pauseResumeTokenStream", {});
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
        console.log("Resume Stream Token Transaction created ", tx);
        const approveTx = await program.rpc.approve({
            accounts: {
              multisig: multisig.publicKey,
              transaction: transaction.publicKey,
              owner: ownerB.publicKey,
            },
            signers: [ownerB],
          });
        console.log("Resume Stream Token TransactionTransaction Approved by ownerB", approveTx);
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
        console.log("Resume Stream Token Transaction executed", exeTxn);

    })


})
import * as anchor from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import { airdropSol, getTxSize } from "./src/utils";
import {
  createMint,
  zebecVault,
  feeVault,
  create_fee_account,
  withdrawData,
} from "./src/Accounts";
import {
  PREFIX_TOKEN,
  STREAM_TOKEN_SIZE,
  zebecProgram,
  multisigProgram,
} from "./src/Constants";
// Configure the client to use the local cluster.
const provider = anchor.Provider.local();
anchor.setProvider(provider);
// Program details

const pid = zebecProgram.programId;

// Accounts
const multisig = anchor.web3.Keypair.generate();
const ownerA = anchor.web3.Keypair.generate();
const ownerB = anchor.web3.Keypair.generate();
const ownerC = anchor.web3.Keypair.generate();
const ownerD = anchor.web3.Keypair.generate();
const owners = [ownerA.publicKey, ownerB.publicKey, ownerC.publicKey];

//Zebec program accounts
//data account
const dataAccount = anchor.web3.Keypair.generate();
//token mint
const tokenMint = new anchor.web3.Keypair();
//users account
const sender = anchor.web3.Keypair.generate();
const receiver = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();
const createUserAndAssociatedWallet = async (
  connection: anchor.web3.Connection,
  mint?: anchor.web3.PublicKey
): Promise<anchor.web3.PublicKey | undefined> => {
  let userAssociatedTokenAccount: anchor.web3.PublicKey | undefined = undefined;
  // Fund sender with some SOL
  let txFund = new anchor.web3.Transaction();
  txFund.add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: sender.publicKey,
      lamports: 5 * anchor.web3.LAMPORTS_PER_SOL,
    })
  );
  const sigTxFund = await provider.send(txFund);
  console.log(`Funded new account with 5 SOL: ${sigTxFund}`);
  if (mint) {
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
    // Create a token account for the sender and mint some tokens
    userAssociatedTokenAccount = await spl.getAssociatedTokenAddress(
      mint,
      multisigSigner,
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const txFundTokenAccount = new anchor.web3.Transaction();
    txFundTokenAccount.add(
      spl.createAssociatedTokenAccountInstruction(
        sender.publicKey,
        userAssociatedTokenAccount,
        multisigSigner,
        mint,
        spl.TOKEN_PROGRAM_ID,
        spl.ASSOCIATED_TOKEN_PROGRAM_ID
      )
    );
    txFundTokenAccount.add(
      spl.createMintToInstruction(
        mint,
        userAssociatedTokenAccount,
        provider.wallet.publicKey,
        1337000000,
        [],
        spl.TOKEN_PROGRAM_ID
      )
    );
    try {
      const txFundTokenSig = await provider.send(txFundTokenAccount, [sender]);
      console.log(
        `New associated account for mint ${mint.toBase58()}: ${txFundTokenSig}`
      );
    } catch (error) {
      console.log(error);
    }
  }
  return userAssociatedTokenAccount;
};
describe("multisig", () => {
  it("Tests the multisig program", async () => {
    const num_owner = owners.length + 1;
    const multisigSize = 8 + 4 + 32 * num_owner + 8 + 1 + 4;
    const threshold = new anchor.BN(2);
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
    await multisigProgram.rpc.createMultisig(owners, threshold, nonce, {
      accounts: {
        multisig: multisig.publicKey,
      },
      instructions: [
        await multisigProgram.account.multisig.createInstruction(
          multisig,
          multisigSize
        ),
      ],
      signers: [multisig],
    });
  });
  it("Airdrop Solana", async () => {
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
    await airdropSol(provider.connection, sender.publicKey);
    await airdropSol(provider.connection, receiver.publicKey);
    await airdropSol(provider.connection, fee_receiver.publicKey);
    await airdropSol(provider.connection, ownerA.publicKey);
    await airdropSol(provider.connection, multisigSigner);
  });
  it("Create Set Vault", async () => {
    const fee_percentage = new anchor.BN(25);
    const tx = await zebecProgram.rpc.createFeeAccount(fee_percentage, {
      accounts: {
        feeVault: await feeVault(fee_receiver.publicKey),
        vaultData: await create_fee_account(fee_receiver.publicKey),
        owner: fee_receiver.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [fee_receiver],
      instructions: [],
    });
    console.log("Your signature is ", tx);
  });
  it("Deposit token", async () => {
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
    createMint(multisigProgram.provider, tokenMint);
    const source_token_account = await createUserAndAssociatedWallet(
      multisigProgram.provider.connection,
      tokenMint.publicKey
    );
    const pda_token_account = await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      await zebecVault(multisigSigner),
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const accounts = [
      {
        pubkey: await zebecVault(multisigSigner),
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
        pubkey: spl.TOKEN_PROGRAM_ID,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: tokenMint.publicKey,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: source_token_account,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: pda_token_account,
        isWritable: true,
        isSigner: false,
      },
    ];
    const transaction = anchor.web3.Keypair.generate();
    const txSize = getTxSize(accounts, owners, false); // Big enough, cuz I'm lazy.
    const data = zebecProgram.coder.instruction.encode("depositToken", {
      amount: new anchor.BN(1000000),
    });
    const tx = await multisigProgram.rpc.createTransaction(
      pid,
      accounts,
      data,
      {
        accounts: {
          multisig: multisig.publicKey,
          transaction: transaction.publicKey,
          proposer: ownerA.publicKey,
        },
        instructions: [
          await multisigProgram.account.transaction.createInstruction(
            transaction,
            txSize
          ),
        ],
        signers: [transaction, ownerA],
      }
    );
    console.log("Multisig Deposit SOl Transaction created by ownerA", tx);

    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Multisig Deposit Token Transaction Approved by ownerB",
      approveTx
    );

    await multisigProgram.rpc.executeTransaction({
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
          pubkey: zebecProgram.programId,
          isWritable: false,
          isSigner: false,
        }),
    });
  });
  it("Creating token stream from multisig", async () => {
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
    const accounts = [
      {
        pubkey: dataAccount.publicKey,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: await withdrawData(
          PREFIX_TOKEN,
          multisigSigner,
          tokenMint.publicKey
        ),
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: fee_receiver.publicKey,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: await create_fee_account(fee_receiver.publicKey),
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: await feeVault(fee_receiver.publicKey),
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
        pubkey: anchor.web3.SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: spl.TOKEN_PROGRAM_ID,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: tokenMint.publicKey,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: anchor.web3.SYSVAR_RENT_PUBKEY,
        isWritable: false,
        isSigner: false,
      },
    ];
    let now = Math.floor(new Date().getTime() / 1000);
    const startTime = new anchor.BN(now - 1000);
    const endTime = new anchor.BN(now + 2000);
    const dataSize = STREAM_TOKEN_SIZE;
    const amount = new anchor.BN(1000000);
    const data = zebecProgram.coder.instruction.encode("tokenStream", {
      startTime: startTime,
      endTime: endTime,
      amount: amount,
    });
    const txSize = getTxSize(accounts, owners, false);
    const transaction = anchor.web3.Keypair.generate();
    const tx = await multisigProgram.rpc.createTransaction(
      pid,
      accounts,
      data,
      {
        accounts: {
          multisig: multisig.publicKey,
          transaction: transaction.publicKey,
          proposer: ownerA.publicKey,
        },
        instructions: [
          await multisigProgram.account.transaction.createInstruction(
            transaction,
            txSize
          ),
          await zebecProgram.account.streamToken.createInstruction(
            dataAccount,
            dataSize
          ),
        ],
        signers: [transaction, ownerA, dataAccount],
      }
    );
    console.log("Multisig Stream Token Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Multisig Stream Token TransactionTransaction Approved by ownerB",
      approveTx
    );
    const exeTxn = await multisigProgram.rpc.executeTransaction({
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
          pubkey: zebecProgram.programId,
          isWritable: false,
          isSigner: false,
        }),
    });
    console.log(
      "Multisig Stream Token TransactionTransaction  executed",
      exeTxn
    );
  });
  it("Pause token stream from multisig", async () => {
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
    const accounts = [
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
        pubkey: dataAccount.publicKey,
        isWritable: true,
        isSigner: false,
      },
    ];
    const transaction = anchor.web3.Keypair.generate();
    const txSize = getTxSize(accounts, owners, false);
    const data = zebecProgram.coder.instruction.encode(
      "pauseResumeTokenStream",
      {}
    );
    const tx = await multisigProgram.rpc.createTransaction(
      pid,
      accounts,
      data,
      {
        accounts: {
          multisig: multisig.publicKey,
          transaction: transaction.publicKey,
          proposer: ownerA.publicKey,
        },
        instructions: [
          await multisigProgram.account.transaction.createInstruction(
            transaction,
            txSize
          ),
        ],
        signers: [transaction, ownerA],
      }
    );
    console.log("Pause Stream Token Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Multisig Stream Token Transaction Approved by ownerB",
      approveTx
    );
    // await delay(100000);
    const exeTxn = await multisigProgram.rpc.executeTransaction({
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
          pubkey: zebecProgram.programId,
          isWritable: false,
          isSigner: false,
        }),
    });
    console.log("Multisig Stream Token Transaction executed", exeTxn);
  });
  it("Resume token stream from multisig", async () => {
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
    const accounts = [
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
        pubkey: dataAccount.publicKey,
        isWritable: true,
        isSigner: false,
      },
    ];
    const transaction = anchor.web3.Keypair.generate();
    const txSize = getTxSize(accounts, owners, false);
    const data = zebecProgram.coder.instruction.encode(
      "pauseResumeTokenStream",
      {}
    );
    const tx = await multisigProgram.rpc.createTransaction(
      pid,
      accounts,
      data,
      {
        accounts: {
          multisig: multisig.publicKey,
          transaction: transaction.publicKey,
          proposer: ownerA.publicKey,
        },
        instructions: [
          await multisigProgram.account.transaction.createInstruction(
            transaction,
            txSize
          ),
        ],
        signers: [transaction, ownerA],
      }
    );
    console.log("Resume Stream Token Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Resume Stream Token TransactionTransaction Approved by ownerB",
      approveTx
    );
    // await delay(100000);
    const exeTxn = await multisigProgram.rpc.executeTransaction({
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
          pubkey: zebecProgram.programId,
          isWritable: false,
          isSigner: false,
        }),
    });
    console.log("Resume Stream Token Transaction executed", exeTxn);
  });
});

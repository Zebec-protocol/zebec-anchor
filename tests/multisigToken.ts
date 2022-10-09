import * as anchor from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import { assert } from "chai";
import { PublicKey } from "@solana/web3.js";
import { solFromProvider, getTxSize } from "./src/utils";
import {
  createMint,
  zebecVault,
  feeVault,
  create_fee_account,
  withdrawData,
  getTokenBalance,
} from "./src/Accounts";
import {
  PREFIX_TOKEN,
  STREAM_TOKEN_SIZE,
  zebecProgram,
  multisigProgram,
} from "./src/Constants";
// Configure the client to use the local cluster.
const provider = anchor.Provider.env();
anchor.setProvider(provider);
// Program details

const pid = zebecProgram.programId;

// Accounts
const multisig = anchor.web3.Keypair.generate();
const ownerA = anchor.web3.Keypair.generate();
const ownerB = anchor.web3.Keypair.generate();
const ownerC = anchor.web3.Keypair.generate();
const owners = [ownerA.publicKey, ownerB.publicKey, ownerC.publicKey];

//Zebec program accounts
//data account
const dataAccount = anchor.web3.Keypair.generate();
//token mint
const tokenMint = new anchor.web3.Keypair();
//users account
const sender = anchor.web3.Keypair.generate();
const receiver = anchor.web3.Keypair.generate();
const receiver_direct = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();

//constant strings
const OPERATE = "NewVaultOption";
const OPERATEDATA = "NewVaultOptionData";

let startTime: anchor.BN;
let endTime: anchor.BN;

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
    } catch (error) {
      console.log(error);
    }
  }
  return userAssociatedTokenAccount;
};
describe("multisig Token", () => {
  it("Tests the create Multisig program", async () => {
    const num_owner = owners.length + 1;
    const multisigSize = 8 + 4 + 32 * num_owner + 8 + 1 + 4;
    const threshold = new anchor.BN(2);
    const [_, nonce] = await anchor.web3.PublicKey.findProgramAddress(
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
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    await solFromProvider(provider,ownerA.publicKey,2);
    await solFromProvider(provider,fee_receiver.publicKey,0.1);
    await solFromProvider(provider,multisigSigner,2);
    await solFromProvider(provider,receiver.publicKey,1);
  });
  it("Create Set Vault", async () => {
    const fee_percentage = new anchor.BN(25);
    const tx = await zebecProgram.rpc.createFeeAccount(fee_percentage, {
      accounts: {
        feeVault: await feeVault(fee_receiver.publicKey),
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeOwner: fee_receiver.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [fee_receiver],
      instructions: [],
    });
    console.log("Your signature is ", tx);
  });
  it("Update Fee Percentage", async () => {
    const fee_percentage = new anchor.BN(20);
    const tx = await zebecProgram.rpc.updateFees(fee_percentage, {
      accounts: {
        feeVault: await feeVault(fee_receiver.publicKey),
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeOwner: fee_receiver.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [fee_receiver],
      instructions: [],
    });
    console.log("Your transaction signature is ", tx);
    const data_create_set = await zebecProgram.account.feeVaultData.fetch(
      await create_fee_account(fee_receiver.publicKey)
    );
    assert.equal(
      data_create_set.feePercentage.toString(),
      fee_percentage.toString()
    );
  });
  it("Send token directly from Multisig", async () => {
    const [multisigSigner, _nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
    createMint(multisigProgram.provider, tokenMint);
    const source_token_account = await createUserAndAssociatedWallet(
      multisigProgram.provider.connection,
      tokenMint.publicKey
    );
    const receiver_token_account = await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      receiver_direct.publicKey,
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const accounts = [
      {
        pubkey: multisigSigner,
        isWritable: true,
        isSigner: true,
      },
      {
        pubkey: receiver_direct.publicKey,
        isWritable: true,
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
        pubkey: receiver_token_account,
        isWritable: true,
        isSigner: false,
      }];
    const transaction = anchor.web3.Keypair.generate();
    const data = zebecProgram.coder.instruction.encode("sendTokenDirectly", {
      amount: new anchor.BN(1000),
    });
    const txSize = getTxSize(accounts, owners, false, 8);
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
    console.log("Multisig Send token Transaction created by ownerA", tx);

    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Multisig Send Token Transaction Approved by ownerB",
      approveTx
    );

    const exeTx=await multisigProgram.rpc.executeTransaction({
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
    console.log("Send Token Directly executed ",exeTx);
  });
  it("Deposit token from Multisig to Multisig's Zebec Vault", async () => {
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
    const source_token_account = await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      multisigSigner,
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID
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
    const data = zebecProgram.coder.instruction.encode("depositToken", {
      amount: new anchor.BN(1000000),
    });
    const txSize = getTxSize(accounts, owners, false, 8);
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
  it("Creating token stream from Multisig", async () => {
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
    const startTime = new anchor.BN(now + 60);
    const endTime = new anchor.BN(now + 2000);
    const dataSize = STREAM_TOKEN_SIZE;
    const amount = new anchor.BN(1000000);
    const canCancel = true;
    const canUpdate = true;
    const data = zebecProgram.coder.instruction.encode("tokenStream", {
      startTime: startTime,
      endTime: endTime,
      amount: amount,
      canCancel,
      canUpdate,
    });
    const txSize = getTxSize(accounts, owners, false, 8 * 3 + 1 * 2);
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
  it("Updating token stream from Multisig", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
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
        pubkey: tokenMint.publicKey,
        isWritable: false,
        isSigner: false,
      },
    ];
    let now = Math.floor(new Date().getTime() / 1000);
    startTime = new anchor.BN(now - 1000);
    endTime = new anchor.BN(now + 2000);
    const amount = new anchor.BN(1000000);
    const data = zebecProgram.coder.instruction.encode("tokenStreamUpdate", {
      startTime: startTime,
      endTime: endTime,
      amount: amount,
    });
    const txSize = getTxSize(accounts, owners, false, 8 * 3);
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
        ],
        signers: [transaction, ownerA],
      }
    );
    console.log("Multisig Update Stream Token Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Multisig Update Stream Token TransactionTransaction Approved by ownerB",
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
      "Multisig Update Stream Token TransactionTransaction  executed",
      exeTxn
    );
  });
  it("Pause token stream from Multisig", async () => {
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
    const data = zebecProgram.coder.instruction.encode(
      "pauseResumeTokenStream",
      {}
    );
    const txSize = getTxSize(accounts, owners, false, 0);
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
  it("Resume token stream from Multisig", async () => {
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
    const data = zebecProgram.coder.instruction.encode(
      "pauseResumeTokenStream",
      {}
    );
    const txSize = getTxSize(accounts, owners, false, 0);
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
  it("Withdraw Token Stream for receiver", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    const pda_token_account = await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      await zebecVault(multisigSigner),
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
    let now = new anchor.BN(Math.floor(new Date().getTime() / 1000));
    const tx = await zebecProgram.rpc.withdrawTokenStream({
      accounts: {
        destAccount: receiver.publicKey,
        sourceAccount: multisigSigner,
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        zebecVault: await zebecVault(multisigSigner),
        dataAccount: dataAccount.publicKey,
        withdrawData: await withdrawData(
          PREFIX_TOKEN,
          multisigSigner,
          tokenMint.publicKey
        ),
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        mint: tokenMint.publicKey,
        pdaAccountTokenAccount: pda_token_account,
        destTokenAccount: dest_token_account,
        feeReceiverTokenAccount: fee_token_account,
      },
      signers: [receiver],
    });
    console.log("Your signature for withdraw token stream is ", tx);
    const data_account = await zebecProgram.account.streamToken.fetch(
      dataAccount.publicKey
    );
    let withdraw_amt =
      (await getTokenBalance(provider.connection, fee_token_account)) +
      (await getTokenBalance(provider.connection, dest_token_account));
    if (data_account.paused == 1 && now < endTime) {
      assert.equal(
        data_account.withdrawLimit.toString(),
        withdraw_amt.toString()
      );
    }
    if (data_account.paused != 1 && now > endTime) {
      let withdrawn_amount = data_account.amount;
      assert.equal(withdrawn_amount.toString(), withdraw_amt.toString());
    }
    if (data_account.paused != 1 && now < endTime) {
      let withdrawn_amount = data_account.withdrawn;
      assert.equal(withdrawn_amount.toString(), withdraw_amt.toString());
    }
  });
  it("Cancel token stream from Multisig", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    let zebecVaultAddress = await zebecVault(multisigSigner);
    const pda_token_account = await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      zebecVaultAddress,
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
    const accounts = [
      {
        pubkey: zebecVaultAddress,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: receiver.publicKey,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: multisigSigner,
        isWritable: true,
        isSigner: true,
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
        pubkey: pda_token_account,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: dest_token_account,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: fee_token_account,
        isWritable: true,
        isSigner: false,
      },
    ];
    const transaction = anchor.web3.Keypair.generate();
    const data = zebecProgram.coder.instruction.encode("cancelTokenStream", {});
    const txSize = getTxSize(accounts, owners, false, 0);
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
    console.log("Cancel Stream Token Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Cancel Stream Token TransactionTransaction Approved by ownerB",
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
    console.log("Cancel Stream Token Transaction executed", exeTxn);
  });
  it("Instant Transfer from Multisig", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    let zebecVaultAddress = await zebecVault(multisigSigner);
    const pda_token_account = await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      zebecVaultAddress,
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
    const accounts = [
      {
        pubkey: zebecVaultAddress,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: receiver.publicKey,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: multisigSigner,
        isWritable: true,
        isSigner: true,
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
        pubkey: pda_token_account,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: dest_token_account,
        isWritable: true,
        isSigner: false,
      },
    ];
    const transaction = anchor.web3.Keypair.generate();
    const txSize = getTxSize(accounts, owners, false, 8);
    const data = zebecProgram.coder.instruction.encode("instantTokenTransfer", {
      amount: new anchor.BN(100),
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
    console.log("Instant Transfer Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Instant Token Transfer TransactionTransaction Approved by ownerB",
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
    console.log("Instant Token Transfer Transaction executed", exeTxn);
  });
  it("Withdraw Deposited Token from Multisig's Zebec Vault", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    const source_token_account = await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      multisigSigner,
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID
    );
    let zebecVaultAddress = await zebecVault(multisigSigner);
    const pda_token_account = await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      zebecVaultAddress,
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const accounts = [
      {
        pubkey: zebecVaultAddress,
        isWritable: false,
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
    const txSize = getTxSize(accounts, owners, false, 8);
    const data = zebecProgram.coder.instruction.encode("tokenWithdrawal", {
      amount: new anchor.BN(100),
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
    console.log("Withdraw Deposited Token Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Withdraw Deposited Token Transaction Approved by ownerB",
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
    console.log("Withdraw Deposited Token Transaction executed", exeTxn);
  });
  it("Retrieve Fees", async () => {
    const [fee_vault, _un] = await PublicKey.findProgramAddress(
      [
        fee_receiver.publicKey.toBuffer(),
        anchor.utils.bytes.utf8.encode(OPERATE),
      ],
      zebecProgram.programId
    );
    const [create_fee_account, _] = await PublicKey.findProgramAddress(
      [
        fee_receiver.publicKey.toBuffer(),
        anchor.utils.bytes.utf8.encode(OPERATEDATA),
        fee_vault.toBuffer(),
      ],
      zebecProgram.programId
    );
    const fee_owner_token_account = await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      fee_receiver.publicKey,
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const fee_vault_token_account = await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      fee_vault,
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const tx = await zebecProgram.rpc.withdrawFeesToken({
      accounts: {
        feeOwner: fee_receiver.publicKey,
        feeVaultData: create_fee_account,
        feeVault: fee_vault,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        mint: tokenMint.publicKey,
        feeReceiverVaultTokenAccount: fee_vault_token_account,
        feeOwnerTokenAccount: fee_owner_token_account,
      },
      signers: [fee_receiver],
      instructions: [],
    });
    console.log("Your signature for retrieve fees is ", tx);
  });
});

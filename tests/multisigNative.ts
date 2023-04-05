import { assert } from 'chai';

import * as anchor from '@project-serum/anchor';

import {
  create_fee_account,
  feeVault,
  withdrawData,
  zebecVault,
} from './src/Accounts';
import {
  multisigProgram,
  PREFIX,
  STREAM_SIZE,
  zebecProgram,
} from './src/Constants';
import {
  getTxSize,
  solFromProvider,
} from './src/utils';

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

//data account
let dataAccount = anchor.web3.Keypair.generate();

//user accounts
const sender = anchor.web3.Keypair.generate();
const receiver = anchor.web3.Keypair.generate();
const receiver_direct = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();

console.log("Sender key: " + sender.publicKey.toBase58());
console.log("Receiver key: " + receiver.publicKey.toBase58());
console.log("Pda key: " + dataAccount.publicKey.toBase58());

describe("multisig", () => {
  it("Tests the create Multisig program", async () => {
    const num_owner = owners.length + 1;
    const multisigSize = 8 + 8 + 32 * num_owner + 8 + 1 + 4;
    const threshold = new anchor.BN(2);
    const [_, nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    // owners - number of multisig owners
    // threshold - number of signers required to confirm the transaction
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
    await solFromProvider(provider,fee_receiver.publicKey,0.5);
    await solFromProvider(provider,multisigSigner,3);
    await solFromProvider(provider,receiver.publicKey,0.1);
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
  it("Deposit Sol from Multisig to Zebec vault of Multisig", async () => {
    // multisigSigner is sender, all the transaction will be signed from multisigSigner account
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
    const pid = zebecProgram.programId;
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
    ];
    const transaction = anchor.web3.Keypair.generate();
    const data = zebecProgram.coder.instruction.encode("depositSol", {
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
      "Multisig Deposit SOl Transaction Approved by ownerB",
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
  it("Send Sol directly from Multisig", async () => {
    // multisigSigner is sender, all the transaction will be signed from multisigSigner account
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
    const pid = zebecProgram.programId;
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
      }
    ];
    const transaction = anchor.web3.Keypair.generate();
    const data = zebecProgram.coder.instruction.encode("sendSolDirectly", {
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
    console.log("Multisig send sol directly", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Multisig Send SOl Transaction Approved by ownerB",
      approveTx
    );

    const executeTx=await multisigProgram.rpc.executeTransaction({
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
      "Multisig Send SOl Transaction execute",
      executeTx
    );
  });  
  it("Creating stream from Multisig", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    const pid = zebecProgram.programId;
    const accounts = [
      {
        pubkey: dataAccount.publicKey,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: await withdrawData(PREFIX, multisigSigner),
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
    ];
    let now = Math.floor(new Date().getTime() / 1000);
    const startTime = new anchor.BN(now + 60);
    const endTime = new anchor.BN(now + 3600);
    const amount = new anchor.BN(1000);
    const canCancel = true;
    const canUpdate = true;
    const data = zebecProgram.coder.instruction.encode("nativeStream", {
      startTime: startTime,
      endTime: endTime,
      amount: amount,
      canCancel,
      canUpdate,
    });
    const txSize = getTxSize(accounts, owners, false, 8 * 3 + 1 * 2);
    const dataSize = STREAM_SIZE;

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
          await zebecProgram.account.stream.createInstruction(
            dataAccount,
            dataSize
          ),
        ],
        signers: [transaction, ownerA, dataAccount],
      }
    );
    console.log("Multisig Stream SOl Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Multisig Stream SOl Transaction Approved by ownerB",
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
    console.log("Multisig Stream SOl Transaction executed", exeTxn);
  });
  it("Updating stream from Multisig", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    const pid = zebecProgram.programId;
    const accounts = [
      {
        pubkey: dataAccount.publicKey,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: await withdrawData(PREFIX, multisigSigner),
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
        pubkey: anchor.web3.SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      },
    ];
    let now = Math.floor(new Date().getTime() / 1000);
    const startTime = new anchor.BN(now - 1000);
    const endTime = new anchor.BN(now + 3600);
    const amount = new anchor.BN(1000);
    const data = zebecProgram.coder.instruction.encode("nativeStreamUpdate", {
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
    console.log("Multisig Update Stream SOl Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Multisig Update Stream SOl Transaction Approved by ownerB",
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
    console.log("Multisig Update  Stream SOl Transaction  executed", exeTxn);
  });
  it("Pause stream from Multisig", async () => {
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
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
      {
        pubkey: await withdrawData(PREFIX, multisigSigner),
        isWritable: true,
        isSigner: false,
      },
    ];
    const transaction = anchor.web3.Keypair.generate();
    const data = zebecProgram.coder.instruction.encode("pauseStream", {});
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
    console.log("Pause Stream SOl Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Multisig Stream SOl Transaction Approved by ownerB",
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
    console.log("Multisig Stream SOl Transaction executed", exeTxn);
  });
  it("Resume stream from Multisig", async () => {
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        multisigProgram.programId
      );
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
      {
        pubkey: await withdrawData(PREFIX, multisigSigner),
        isWritable: true,
        isSigner: false,
      },
    ];
    const transaction = anchor.web3.Keypair.generate();
    const data = zebecProgram.coder.instruction.encode("pauseStream", {});
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
    console.log("Resume Stream SOl Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Resume Stream SOl TransactionTransaction Approved by ownerB",
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
    console.log("Resume Stream SOl Transaction executed", exeTxn);
  });
  it("Withdraw Sol for Receiver", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    const tx = await zebecProgram.rpc.withdrawStream({
      accounts: {
        zebecVault: await zebecVault(multisigSigner),
        sender: multisigSigner,
        receiver: receiver.publicKey,
        dataAccount: dataAccount.publicKey,
        withdrawData: await withdrawData(PREFIX, multisigSigner),
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [receiver],
    });
    console.log("Your transaction signature", tx);
  });
  it("Cancel stream from Multisig", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    let zebecVaultAddress = await zebecVault(multisigSigner);
    const accounts = [
      {
        pubkey: zebecVaultAddress,
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
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: dataAccount.publicKey,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: await withdrawData(PREFIX, multisigSigner),
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
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      },
    ];
    const data = zebecProgram.coder.instruction.encode("cancelStream", {});
    const txSize = getTxSize(accounts, owners, false, 0);

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
    console.log("Cancel Stream SOl Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log("Cancel Stream SOl Transaction Approved by ownerB", approveTx);
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
    console.log("Cancel Stream SOl Transaction  executed", exeTxn);
  });
  it("Intsant Native Transfer from Multisig's zebec vault", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    let zebecVaultAddress = await zebecVault(multisigSigner);
    const pid = zebecProgram.programId;
    const accounts = [
      {
        pubkey: zebecVaultAddress,
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
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: await withdrawData(PREFIX, multisigSigner),
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      },
    ];
    const data = zebecProgram.coder.instruction.encode(
      "instantNativeTransfer",
      {
        amount: new anchor.BN(100),
      }
    );
    const txSize = getTxSize(accounts, owners, false, 8);

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
    console.log("Instant Transfer Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log("Instant Transfer Transaction Approved by ownerB", approveTx);
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
    console.log("Cancel Stream SOl Transaction  executed", exeTxn);
  });
  it("Withdraw Deposited Native Token from Multisig's zebec vault", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    let zebecVaultAddress = await zebecVault(multisigSigner);
    const pid = zebecProgram.programId;
    const accounts = [
      {
        pubkey: zebecVaultAddress,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: multisigSigner,
        isWritable: true,
        isSigner: true,
      },
      {
        pubkey: await withdrawData(PREFIX, multisigSigner),
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: anchor.web3.SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      },
    ];
    const data = zebecProgram.coder.instruction.encode("nativeWithdrawal", {
      amount: new anchor.BN(100),
    });
    const txSize = getTxSize(accounts, owners, false, 8);

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
    console.log("Withdraw Deposited Native Transaction created ", tx);
    const approveTx = await multisigProgram.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
    console.log(
      "Withdraw Deposited Native Transaction Approved by ownerB",
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
    console.log("Withdraw Deposited Native Transaction  executed", exeTxn);
  });
  it("Retrieve Fees", async () => {
    const tx = await zebecProgram.rpc.withdrawFeesSol({
      accounts: {
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [fee_receiver],
      instructions: [],
    });
    console.log("Your transaction signature is ", tx);
  });
});

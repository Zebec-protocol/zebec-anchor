import * as anchor from "@project-serum/anchor";
import {
  zebecVault,
  withdrawData,
  create_fee_account,
  feeVault,
} from "../../../src/Accounts";
import { assert } from "chai";
import { PREFIX, zebecProgram, multisigProgram } from "../../../src/Constants";
import { airdropSol } from "../../../src/utils";

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
const ownerD = anchor.web3.Keypair.generate();
const owners = [ownerA.publicKey, ownerB.publicKey, ownerC.publicKey];

//data account
let dataAccount = anchor.web3.Keypair.generate();

//user accounts
const sender = anchor.web3.Keypair.generate();
const receiver = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();

console.log("Sender key: " + sender.publicKey.toBase58());
console.log("Receiver key: " + receiver.publicKey.toBase58());
console.log("Pda key: " + dataAccount.publicKey.toBase58());

describe("multisig native", () => {
  it("Tests the multisig program", async () => {
    const multisigSize = 200;
    const threshold = new anchor.BN(3);
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
    await airdropSol(provider.connection, sender.publicKey);
    await airdropSol(provider.connection, fee_receiver.publicKey);
    await airdropSol(provider.connection, receiver.publicKey);
    await airdropSol(provider.connection, ownerA.publicKey);
    await airdropSol(provider.connection, multisigSigner);
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
  it("Deposit Sol", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
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
    const txSize = 1000; // Big enough, cuz I'm lazy.
    const data = zebecProgram.coder.instruction.encode("depositSol", {
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
    try {
      const approveTx = await multisigProgram.rpc.approve({
        accounts: {
          multisig: multisig.publicKey,
          transaction: transaction.publicKey,
          owner: ownerD.publicKey,
        },
        signers: [ownerD],
      });
      console.log(
        "Multisig Deposit SOl Transaction Approved by ownerD",
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
    } catch (err) {
      console.log("errrorr");
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Creating stream from multisig", async () => {
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
    const startTime = new anchor.BN(now - 1000);
    const endTime = new anchor.BN(now + 3600);
    const amount = new anchor.BN(1000);
    let canCancel = true;
    let canUpdate = true;
    const data = zebecProgram.coder.instruction.encode("nativeStream", {
      startTime: startTime,
      endTime: endTime,
      amount: amount,
      canCancel,
      canUpdate,
    });
    const txSize = 1000; // Big enough, cuz I'm lazy.
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;

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
    try {
      const approveTx = await multisigProgram.rpc.approve({
        accounts: {
          multisig: multisig.publicKey,
          transaction: transaction.publicKey,
          owner: ownerD.publicKey,
        },
        signers: [ownerD],
      });
      console.log(
        "Multisig Stream SOl Transaction Approved by ownerD",
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
      console.log("Multisig Stream SOl Transaction  executed", exeTxn);
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Updating stream from multisig", async () => {
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
    const data = zebecProgram.coder.instruction.encode("nativeStream", {
      startTime: startTime,
      endTime: endTime,
      amount: amount,
    });
    const txSize = 1000; // Big enough, cuz I'm lazy.

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
    try {
      const approveTx = await multisigProgram.rpc.approve({
        accounts: {
          multisig: multisig.publicKey,
          transaction: transaction.publicKey,
          owner: ownerD.publicKey,
        },
        signers: [ownerD],
      });
      console.log(
        "Multisig Update Stream SOl Transaction Approved by ownerD",
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
      console.log("Multisig Update Stream SOl Transaction  executed", exeTxn);
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Pause stream from multisig", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
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
    ];
    const transaction = anchor.web3.Keypair.generate();
    const txSize = 1000;
    const data = zebecProgram.coder.instruction.encode("pauseStream", {});
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
    try {
      const approveTx = await multisigProgram.rpc.approve({
        accounts: {
          multisig: multisig.publicKey,
          transaction: transaction.publicKey,
          owner: ownerD.publicKey,
        },
        signers: [ownerD],
      });
      console.log(
        "Multisig Stream SOl Transaction Approved by ownerD",
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
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Resume stream from multisig", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
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
    ];
    const transaction = anchor.web3.Keypair.generate();
    const txSize = 1000;
    const data = zebecProgram.coder.instruction.encode("pauseStream", {});
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
    try {
      const approveTx = await multisigProgram.rpc.approve({
        accounts: {
          multisig: multisig.publicKey,
          transaction: transaction.publicKey,
          owner: ownerD.publicKey,
        },
        signers: [ownerD],
      });
      console.log(
        "Resume Stream SOl Transaction Approved by ownerD",
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
      console.log("Resume Stream SOl Transaction executed", exeTxn);
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Cancel stream from multisig", async () => {
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
    const txSize = 1000; // Big enough, cuz I'm lazy.

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
    try {
      const approveTx = await multisigProgram.rpc.approve({
        accounts: {
          multisig: multisig.publicKey,
          transaction: transaction.publicKey,
          owner: ownerD.publicKey,
        },
        signers: [ownerD],
      });
      console.log(
        "Cancel Stream SOl Transaction Approved by ownerD",
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
      console.log("Cancel Stream SOl Transaction  executed", exeTxn);
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Intsant Native Transfer from multisig", async () => {
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
    const txSize = 1000; // Big enough, cuz I'm lazy.

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
    try {
      const approveTx = await multisigProgram.rpc.approve({
        accounts: {
          multisig: multisig.publicKey,
          transaction: transaction.publicKey,
          owner: ownerD.publicKey,
        },
        signers: [ownerD],
      });
      console.log("Instant Transfer Transaction Approved by ownerD", approveTx);
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
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Withdraw Deposited Native Token from multisig", async () => {
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
    const txSize = 1000; // Big enough, cuz I'm lazy.

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
    try {
      const approveTx = await multisigProgram.rpc.approve({
        accounts: {
          multisig: multisig.publicKey,
          transaction: transaction.publicKey,
          owner: ownerD.publicKey,
        },
        signers: [ownerD],
      });
      console.log(
        "Withdraw Deposited Native Transaction Approved by ownerD",
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
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
});

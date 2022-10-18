import * as anchor from "@project-serum/anchor";
import * as spl from "@solana/spl-token";
import { airdropSol } from "../../../src/utils";
import {
  createMint,
  zebecVault,
  feeVault,
  create_fee_account,
  withdrawData,
} from "../../../src/Accounts";
import { assert } from "chai";
import {
  PREFIX,
  zebecProgram,
  multisigProgram,
  PREFIX_TOKEN,
} from "../../../src/Constants";
// Configure the client to use the local cluster.
const provider = anchor.Provider.env();
anchor.setProvider(provider);

const pid = zebecProgram.programId;

//data account
const dataAccount = anchor.web3.Keypair.generate();
// Accounts
const multisig = anchor.web3.Keypair.generate();
const ownerA = anchor.web3.Keypair.generate();
const ownerB = anchor.web3.Keypair.generate();
const ownerC = anchor.web3.Keypair.generate();
const ownerD = anchor.web3.Keypair.generate();
const owners = [ownerA.publicKey, ownerB.publicKey, ownerC.publicKey];

//token mint
const tokenMint = new anchor.web3.Keypair();
//users account
const sender = anchor.web3.Keypair.generate();
const receiver = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();

describe("multisig spl", () => {
  it("Tests the multisig multisigProgram", async () => {
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
  it("Deposit token verify error when transaction not signed by the required owners", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    createMint(multisigProgram.provider, tokenMint);
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
    const txSize = 1000; // Big enough, cuz I'm lazy.
    const data = zebecProgram.coder.instruction.encode("depositToken", {
      amount: new anchor.BN(1600000),
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
        "Multisig Deposit Token Transaction Approved by ownerD",
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
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Creating token stream from multisig", async () => {
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
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;
    const amount = new anchor.BN(1000000);
    let canCancel = true;
    let canUpdate = true;
    const data = zebecProgram.coder.instruction.encode("tokenStream", {
      startTime: startTime,
      endTime: endTime,
      amount: amount,
      canCancel,
      canUpdate,
    });
    const txSize = 1000;
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
        "Multisig Stream Token TransactionTransaction Approved by ownerD",
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
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Updating token stream from multisig", async () => {
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
        pubkey: anchor.web3.SystemProgram.programId,
        isWritable: false,
        isSigner: false,
      },
    ];
    let now = Math.floor(new Date().getTime() / 1000);
    const startTime = new anchor.BN(now - 1000);
    const endTime = new anchor.BN(now + 2000);
    const amount = new anchor.BN(1000000);
    const data = zebecProgram.coder.instruction.encode("tokenStreamUpdate", {
      startTime: startTime,
      endTime: endTime,
      amount: amount,
    });
    const txSize = 1000;
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
        "Multisig Update Stream Token TransactionTransaction Approved by ownerD",
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
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Pause token stream from multisig", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
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
    const txSize = 1000;
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
        "Multisig Stream Token Transaction Approved by ownerD",
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
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Resume token stream from multisig", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
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
    const txSize = 1000;
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
        "Resume Stream Token TransactionTransaction Approved by ownerD",
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
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Cancel token stream from multisig", async () => {
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
    const txSize = 1000;
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
        "Cancel Stream Token TransactionTransaction Approved by ownerD",
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
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Instant Transfer from multisig", async () => {
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
    const txSize = 1000;
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
        "Instant Token Transfer TransactionTransaction Approved by ownerD",
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
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
  it("Withdraw Deposited Token from multisig", async () => {
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
    const txSize = 1000;
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
        "Withdraw Deposited Token Transaction Approved by ownerD",
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
    } catch (err) {
      assert.equal(
        err.message.split(": ")[1],
        "The given owner is not part of this multisig."
      );
    }
  });
});

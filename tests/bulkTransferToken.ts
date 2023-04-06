import { describe } from "mocha";

import * as anchor from "@project-serum/anchor";
import { BN, web3 } from "@project-serum/anchor";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { batchTransferProgram, multisigProgram } from "./src/Constants";
import { getTxSize, solFromProvider, tokenFromProvider } from "./src/utils";

const provider = anchor.Provider.env();
anchor.setProvider(provider);

describe("bulk transfer flow test", () => {
  const multisig = web3.Keypair.generate();
  const ownerA = web3.Keypair.generate();
  const ownerB = web3.Keypair.generate();
  const ownerC = web3.Keypair.generate();
  const owners = [ownerA.publicKey, ownerB.publicKey, ownerC.publicKey];

  const multisigSize = 8 + 8 + 32 * owners.length + 8 + 1 + 4;
  const threshold = new BN(2);

  const receiver = anchor.web3.Keypair.generate();
  const fee_receiver = new anchor.web3.Keypair();

  it("creates multisig", async () => {
    const [, nonce] = await web3.PublicKey.findProgramAddress(
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

  it("Send Token To MultisigSigner", async () => {
    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    await solFromProvider(provider, ownerA.publicKey, 0.2);
    await solFromProvider(provider, multisigSigner, 0.1);
    const mint = new anchor.web3.PublicKey(
      "AbLwGR8A1wvsiLWrzzA5eYPoQw51NVMcMMTPvAv5LTJ"
    );
    await tokenFromProvider(provider, multisigSigner, mint, 1000000);
  });

  it("Transfer token", async () => {
    const pid = batchTransferProgram.programId;
    const mint = new anchor.web3.PublicKey(
      "AbLwGR8A1wvsiLWrzzA5eYPoQw51NVMcMMTPvAv5LTJ"
    );

    //create random accounts
    const publicKeys: web3.PublicKey[] = [];
    for (let i = 0; i < 9; i++) {
      publicKeys.push(anchor.web3.Keypair.generate().publicKey);
    }
    const pubkeysTokenAccounts: web3.PublicKey[] = [];
    const pubkeyTokenAccountIxn: anchor.web3.TransactionInstruction[] = [];
    const amounts: BN[] = [];

    //create token accounts for random accounts
    for (let i = 0; i < publicKeys.length; i++) {
      const tokenAcc = await getAssociatedTokenAddress(
        mint,
        publicKeys[i],
        true
      );
      pubkeysTokenAccounts.push(tokenAcc);
      const ixn = createAssociatedTokenAccountInstruction(
        provider.wallet.publicKey,
        tokenAcc,
        publicKeys[i],
        mint
      );
      pubkeyTokenAccountIxn.push(ixn);
      amounts.push(new BN(100000));
    }
    const tx = new anchor.web3.Transaction();
    tx.add(...pubkeyTokenAccountIxn);
    await provider.send(tx);

    const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      multisigProgram.programId
    );
    const multisigSignerTokenAccount = await getAssociatedTokenAddress(
      mint,
      multisigSigner,
      true
    );

    const accounts: web3.AccountMeta[] = [];
    accounts.push(
      {
        pubkey: multisigSigner,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: multisigSignerTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: mint,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }
    );
    for (const account of pubkeysTokenAccounts) {
      accounts.push({
        pubkey: account,
        isSigner: false,
        isWritable: true,
      });
    }

    accounts.push(
      {
        pubkey: multisigSigner,
        isSigner: true,
        isWritable: true,
      },
      {
        pubkey: multisigSignerTokenAccount,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: mint,
        isSigner: false,
        isWritable: false,
      },
      {
        pubkey: TOKEN_PROGRAM_ID,
        isSigner: false,
        isWritable: false,
      }
    );

    const transaction = anchor.web3.Keypair.generate();

    const data = batchTransferProgram.coder.instruction.encode(
      "batchTokenTransfer",
      {
        amount: amounts,
      }
    );
    const txSize = getTxSize(accounts, owners, true, 8 * amounts.length);
    console.log("Accounts length: ", amounts.length);

    try {
      const createTransactionSignature =
        await multisigProgram.rpc.createTransaction(pid, accounts, data, {
          accounts: {
            multisig: multisig.publicKey,
            proposer: ownerA.publicKey,
            transaction: transaction.publicKey,
          },
          instructions: [
            await multisigProgram.account.transaction.createInstruction(
              transaction,
              txSize
            ),
          ],
          signers: [transaction, ownerA],
        });

      console.log("sig :", createTransactionSignature);
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

      const remainingAccounts = accounts
        .map((t) => {
          if (t.pubkey.equals(multisigSigner)) {
            return { ...t, isSigner: false };
          }
          return t;
        })
        .concat({
          pubkey: batchTransferProgram.programId,
          isWritable: false,
          isSigner: false,
        });

      const execSig = await multisigProgram.rpc.executeTransaction({
        accounts: {
          multisig: multisig.publicKey,
          multisigSigner,
          transaction: transaction.publicKey,
        },
        remainingAccounts,
      });
      console.log("exec Sig: ", execSig);
    } catch (e) {
      console.log(e);
    }
  });
});

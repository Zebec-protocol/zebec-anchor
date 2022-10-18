import * as anchor from "@project-serum/anchor";
import {
  feeVault,
  create_fee_account,
  zebecVault,
  withdrawData,
} from "../../../src/Accounts";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
import { solFromProvider } from "../../../src/utils";
import { PREFIX, zebecProgram } from "../../../src/Constants";
import { getClusterTime, getNativeTokenBalance } from "../../../src/utils";
// Configure the client to use the local cluster.
const provider = anchor.Provider.env();
anchor.setProvider(provider);

let dataAccount = anchor.web3.Keypair.generate();

//user accounts
const sender = anchor.web3.Keypair.generate();
const receiver = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();

let startTime: anchor.BN;
let endTime: anchor.BN;

const streamAmount = new anchor.BN(2 * LAMPORTS_PER_SOL);

console.log("Sender key: " + sender.publicKey.toBase58());
console.log("Receiver key: " + receiver.publicKey.toBase58());
console.log("DataAccount key: " + dataAccount.publicKey.toBase58());

describe("zebec native startStreamInstantTransferError", () => {
  it("Airdrop Solana", async () => {
    await solFromProvider(zebecProgram.provider, sender.publicKey, 5);
    await solFromProvider(zebecProgram.provider, sender.publicKey, 5);
    await solFromProvider(zebecProgram.provider, receiver.publicKey, 1);
    await solFromProvider(zebecProgram.provider, fee_receiver.publicKey, 1);
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
    console.log("Your transaction signature is ", tx);
  });
  it("Deposit Sol", async () => {
    const depositAmount = new anchor.BN(3 * LAMPORTS_PER_SOL);
    const tx = await zebecProgram.rpc.depositSol(depositAmount, {
      accounts: {
        zebecVault: await zebecVault(sender.publicKey),
        sender: sender.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [sender],
      instructions: [],
    });
    console.log("Your transaction signature", tx);
  });

  it("Stream Sol", async () => {
    let now = await getClusterTime(provider.connection);
    startTime = new anchor.BN(now);
    endTime = new anchor.BN(now + 25);
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;
    let canCancel = true;
    let canUpdate = true;
    const tx = await zebecProgram.rpc.nativeStream(
      startTime,
      endTime,
      streamAmount,
      canCancel,
      canUpdate,
      {
        accounts: {
          dataAccount: dataAccount.publicKey,
          withdrawData: await withdrawData(PREFIX, sender.publicKey),
          feeOwner: fee_receiver.publicKey,
          feeVaultData: await create_fee_account(fee_receiver.publicKey),
          feeVault: await feeVault(fee_receiver.publicKey),
          systemProgram: anchor.web3.SystemProgram.programId,
          sender: sender.publicKey,
          receiver: receiver.publicKey,
        },
        instructions: [
          await zebecProgram.account.stream.createInstruction(
            dataAccount,
            dataSize
          ),
        ],
        signers: [sender, dataAccount],
      }
    );
    console.log("Your transaction signature", tx);
  });

  it("Instant Transfer", async () => {
    const amount = new anchor.BN(1 * LAMPORTS_PER_SOL);
    let zebecVaultAddress = await zebecVault(sender.publicKey);
    let zebecVaultBalanceBeforeInstantTransfer = await getNativeTokenBalance(
      zebecVaultAddress,
      provider
    );
    try {
      const tx = await zebecProgram.rpc.instantNativeTransfer(amount, {
        accounts: {
          zebecVault: await zebecVault(sender.publicKey),
          sender: sender.publicKey,
          receiver: receiver.publicKey,
          withdrawData: await withdrawData(PREFIX, sender.publicKey),
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [sender],
      });
      console.log("Your transaction signature", tx);
    } catch (err) {
      let zebecVaultBalanceAfterInstantTransfer = await getNativeTokenBalance(
        zebecVaultAddress,
        provider
      );
      assert.equal(
        err.message.split(": ")[1],
        "Cannot withdraw streaming amount"
      );
      assert.equal(
        zebecVaultBalanceBeforeInstantTransfer,
        zebecVaultBalanceAfterInstantTransfer
      );
    }
  });
});

import * as anchor from "@project-serum/anchor";
import {
  feeVault,
  create_fee_account,
  zebecVault,
  withdrawData,
} from "../../../src/Accounts";
import { assert } from "chai";
import { airdropDelay, airdropSol, solFromProvider } from "../../../src/utils";
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

const amount = new anchor.BN(180000);

console.log("Sender key: " + sender.publicKey.toBase58());
console.log("Receiver key: " + receiver.publicKey.toBase58());
console.log("DataAccount key: " + dataAccount.publicKey.toBase58());

describe("zebec native startPauseCancel", () => {
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
    const amount = new anchor.BN(1000000);
    const tx = await zebecProgram.rpc.depositSol(amount, {
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
    endTime = new anchor.BN(now + 40);
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;
    let canCancel = true;
    let canUpdate = true;
    const tx = await zebecProgram.rpc.nativeStream(
      startTime,
      endTime,
      amount,
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

  it("Pause Stream", async () => {
    await airdropDelay(7300);
    const tx = await zebecProgram.rpc.pauseStream({
      accounts: {
        sender: sender.publicKey,
        receiver: receiver.publicKey,
        dataAccount: dataAccount.publicKey,
      },
      signers: [sender],
      instructions: [],
    });
    console.log("Your transaction signature", tx);
  });
  it("Withdraw Sol", async () => {
    let zebecVaultAddress = await zebecVault(sender.publicKey);
    const tx = await zebecProgram.rpc.withdrawStream({
      accounts: {
        zebecVault: zebecVaultAddress,
        sender: sender.publicKey,
        receiver: receiver.publicKey,
        dataAccount: dataAccount.publicKey,
        withdrawData: await withdrawData(PREFIX, sender.publicKey),
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [receiver],
    });
    console.log("Your transaction signature", tx);
  });
  it("Cancel Sol Stream", async () => {
    await airdropDelay(3000);
    let zebecVaultAddress = await zebecVault(sender.publicKey);
    const withdraw_data_before_cancel = await withdrawData(
      PREFIX,
      sender.publicKey
    );
    let senderBalanceBeforeCancelNative = await provider.connection.getBalance(
      sender.publicKey
    );
    let receiverBalanceBeforeCancel = await getNativeTokenBalance(
      receiver.publicKey,
      provider
    );
    let zebecVaultBalanceBeforeCancel = await getNativeTokenBalance(
      zebecVaultAddress,
      provider
    );
    const withdraw_state_info_before_cancel =
      await zebecProgram.account.solWithdraw.fetch(withdraw_data_before_cancel);
    const data_account = await zebecProgram.account.stream.fetch(
      dataAccount.publicKey
    );
    let dataAccountAmount = data_account.amount.toString();
    let dataAccountWithdrawn = data_account.withdrawn.toString();
    let dataAccountSol = await provider.connection.getBalance(
      dataAccount.publicKey
    );
    const tx = await zebecProgram.rpc.cancelStream({
      accounts: {
        zebecVault: await zebecVault(sender.publicKey),
        sender: sender.publicKey,
        receiver: receiver.publicKey,
        dataAccount: dataAccount.publicKey,
        withdrawData: await withdrawData(PREFIX, sender.publicKey),
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [sender],
    });
    console.log("Your signature for cancel token stream is ", tx);
    let senderBalanceAfterCancelNative = await provider.connection.getBalance(
      sender.publicKey
    );
    const withdraw_data_after_cancel = await withdrawData(
      PREFIX,
      sender.publicKey
    );
    const withdraw_state_info_after_cancel =
      await zebecProgram.account.solWithdraw.fetch(withdraw_data_after_cancel);

    let diffOfWithdrawStateInfoAmount =
      withdraw_state_info_before_cancel.amount.toString() -
      withdraw_state_info_after_cancel.amount.toString();
    let zebecVaultBalanceAfterCancel = await getNativeTokenBalance(
      zebecVaultAddress,
      provider
    );

    let receiverBalanceAfterCancel = await getNativeTokenBalance(
      receiver.publicKey,
      provider
    );

    assert.equal(
      diffOfWithdrawStateInfoAmount,
      Number(dataAccountAmount) - dataAccountWithdrawn
    );
    assert.equal(
      senderBalanceAfterCancelNative,
      Number(dataAccountSol) + senderBalanceBeforeCancelNative
    );
    assert.equal(receiverBalanceAfterCancel, receiverBalanceBeforeCancel);
    assert.equal(zebecVaultBalanceAfterCancel, zebecVaultBalanceBeforeCancel);
  });
});

import * as anchor from "@project-serum/anchor";
import {
  feeVault,
  create_fee_account,
  zebecVault,
  withdrawData,
} from "../../../src/Accounts";
import { assert } from "chai";
import { airdropDelay, solFromProvider } from "../../../src/utils";
import { PREFIX, zebecProgram } from "../../../src/Constants";
import {
  getClusterTime,
  getNativeTokenBalance,
  getTxTime,
} from "../../../src/utils";
// Configure the client to use the local cluster.
const provider = anchor.Provider.env();
anchor.setProvider(provider);

let firstDataAccount = anchor.web3.Keypair.generate();
let secondDataAccount = anchor.web3.Keypair.generate();

//user accounts
const sender = anchor.web3.Keypair.generate();
const firstReceiver = anchor.web3.Keypair.generate();
const secondReceiver = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();

let firstStartTime: anchor.BN;
let firstEndTime: anchor.BN;
let secondStartTime: anchor.BN;
let secondEndTime: anchor.BN;
let pausedAt: anchor.BN;
let paused: anchor.BN;
let resumedAt: anchor.BN;

const firstStreamedAmount = new anchor.BN(180000);
const secondStreamedAmount = new anchor.BN(180000);

console.log("Sender key: " + sender.publicKey.toBase58());
console.log("First Receiver key: " + firstReceiver.publicKey.toBase58());
console.log("Second Receiver key: " + secondReceiver.publicKey.toBase58());
console.log("DataAccount key: " + firstDataAccount.publicKey.toBase58());

describe("zebec native StreamWithTwoReceiver", () => {
  it("Airdrop Solana", async () => {
    await solFromProvider(zebecProgram.provider, sender.publicKey, 5);
    await solFromProvider(zebecProgram.provider, sender.publicKey, 5);
    await solFromProvider(zebecProgram.provider, firstReceiver.publicKey, 1);
    await solFromProvider(zebecProgram.provider, secondReceiver.publicKey, 1);
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
  it("First Stream Sol", async () => {
    let now = await getClusterTime(provider.connection);
    firstStartTime = new anchor.BN(now);
    firstEndTime = new anchor.BN(now + 25);
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;
    let canCancel = true;
    let canUpdate = true;
    const tx = await zebecProgram.rpc.nativeStream(
      firstStartTime,
      firstEndTime,
      firstStreamedAmount,
      canCancel,
      canUpdate,
      {
        accounts: {
          dataAccount: firstDataAccount.publicKey,
          withdrawData: await withdrawData(PREFIX, sender.publicKey),
          feeOwner: fee_receiver.publicKey,
          feeVaultData: await create_fee_account(fee_receiver.publicKey),
          feeVault: await feeVault(fee_receiver.publicKey),
          systemProgram: anchor.web3.SystemProgram.programId,
          sender: sender.publicKey,
          receiver: firstReceiver.publicKey,
        },
        instructions: [
          await zebecProgram.account.stream.createInstruction(
            firstDataAccount,
            dataSize
          ),
        ],
        signers: [sender, firstDataAccount],
      }
    );
    console.log("Your transaction signature", tx);
  });
  it("Second Stream Sol", async () => {
    let now = await getClusterTime(provider.connection);
    secondStartTime = new anchor.BN(now);
    secondEndTime = new anchor.BN(now + 25);
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;
    let canCancel = true;
    let canUpdate = true;
    const tx = await zebecProgram.rpc.nativeStream(
      secondStartTime,
      secondEndTime,
      secondStreamedAmount,
      canCancel,
      canUpdate,
      {
        accounts: {
          dataAccount: secondDataAccount.publicKey,
          withdrawData: await withdrawData(PREFIX, sender.publicKey),
          feeOwner: fee_receiver.publicKey,
          feeVaultData: await create_fee_account(fee_receiver.publicKey),
          feeVault: await feeVault(fee_receiver.publicKey),
          systemProgram: anchor.web3.SystemProgram.programId,
          sender: sender.publicKey,
          receiver: secondReceiver.publicKey,
        },
        instructions: [
          await zebecProgram.account.stream.createInstruction(
            secondDataAccount,
            dataSize
          ),
        ],
        signers: [sender, secondDataAccount],
      }
    );
    console.log("Your transaction signature", tx);
  });

  it("Pause Stream", async () => {
    await airdropDelay(7300);
    const tx = await zebecProgram.rpc.pauseStream({
      accounts: {
        sender: sender.publicKey,
        receiver: firstReceiver.publicKey,
        dataAccount: firstDataAccount.publicKey,
      },
      signers: [sender],
      instructions: [],
    });
    console.log("Your transaction signature", tx);
    paused = "1";
    pausedAt = await getTxTime(tx, provider);
  });
  it("Resume Stream", async () => {
    await airdropDelay(2000);
    const tx = await zebecProgram.rpc.pauseStream({
      accounts: {
        sender: sender.publicKey,
        receiver: firstReceiver.publicKey,
        dataAccount: firstDataAccount.publicKey,
      },
      signers: [sender],
      instructions: [],
    });
    console.log("Your transaction signature", tx);
    resumedAt = await getTxTime(tx, provider);
  });
  it("Withdraw first stream Sol", async () => {
    let zebecVaultAddress = await zebecVault(sender.publicKey);
    let receiverBalanceBeforeWithdraw = await getNativeTokenBalance(
      firstReceiver.publicKey,
      provider
    );
    let zebecVaultBalanceBeforeWithdraw = await getNativeTokenBalance(
      zebecVaultAddress,
      provider
    );
    const tx = await zebecProgram.rpc.withdrawStream({
      accounts: {
        zebecVault: zebecVaultAddress,
        sender: sender.publicKey,
        receiver: firstReceiver.publicKey,
        dataAccount: firstDataAccount.publicKey,
        withdrawData: await withdrawData(PREFIX, sender.publicKey),
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [firstReceiver],
    });
    console.log("Your transaction signature", tx);
    let withDrawTime = await getTxTime(tx, provider);
    const data_account = await zebecProgram.account.stream.fetch(
      firstDataAccount.publicKey
    );
    if (paused == "1") {
      let withdrawAmount = data_account.withdrawn.toString();
      let totalStreamedAmount = data_account.amount.toString();
      console.log(
        "case 1==> its paused and resume and withdraw time is less than end time",
        withDrawTime < firstEndTime
      );
      let receiverBalanceAfterWithdraw = await getNativeTokenBalance(
        firstReceiver.publicKey,
        provider
      );
      let zebecVaultBalanceAfterWithdraw = await getNativeTokenBalance(
        zebecVaultAddress,
        provider
      );
      let diffBetweenResumeAndPauseTime = resumedAt - pausedAt;
      let diffBetweenStartAndWithdrawTime = withDrawTime - firstStartTime;
      let diffBetweenStartAndEndTime = firstEndTime - firstStartTime;
      let perSecondAmount = totalStreamedAmount / diffBetweenStartAndEndTime;
      let totalSpendTime =
        diffBetweenStartAndWithdrawTime - diffBetweenResumeAndPauseTime;
      let expectedWithdrawAmount = perSecondAmount * totalSpendTime;
      let zebecFee = parseInt(
        ((expectedWithdrawAmount / 100) * 0.25).toString()
      );
      let expectedZebecVaultBalance =
        zebecVaultBalanceBeforeWithdraw - expectedWithdrawAmount;
      let expectedReceiverBalance =
        receiverBalanceBeforeWithdraw + expectedWithdrawAmount - zebecFee;
      assert.equal(withdrawAmount, expectedWithdrawAmount);
      assert.equal(receiverBalanceAfterWithdraw, expectedReceiverBalance);
      assert.equal(zebecVaultBalanceAfterWithdraw, expectedZebecVaultBalance);
    }
  });
  it("Withdraw second stream Sol", async () => {
    let zebecVaultAddress = await zebecVault(sender.publicKey);
    let receiverBalanceBeforeWithdraw = await getNativeTokenBalance(
      secondReceiver.publicKey,
      provider
    );
    let zebecVaultBalanceBeforeWithdraw = await getNativeTokenBalance(
      zebecVaultAddress,
      provider
    );
    const tx = await zebecProgram.rpc.withdrawStream({
      accounts: {
        zebecVault: zebecVaultAddress,
        sender: sender.publicKey,
        receiver: secondReceiver.publicKey,
        dataAccount: secondDataAccount.publicKey,
        withdrawData: await withdrawData(PREFIX, sender.publicKey),
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
      },
      signers: [secondReceiver],
    });
    console.log("Your transaction signature", tx);
    let withDrawTime = await getTxTime(tx, provider);
    const data_account = await zebecProgram.account.stream.fetch(
      secondDataAccount.publicKey
    );
    if (paused == "1") {
      let withdrawAmount = data_account.withdrawn.toString();
      let totalStreamedAmount = data_account.amount.toString();
      console.log(
        "case 1==> its paused and resume and withdraw time is less than end time",
        withDrawTime < firstEndTime
      );
      let receiverBalanceAfterWithdraw = await getNativeTokenBalance(
        secondReceiver.publicKey,
        provider
      );
      let zebecVaultBalanceAfterWithdraw = await getNativeTokenBalance(
        zebecVaultAddress,
        provider
      );
      let diffBetweenStartAndWithdrawTime = withDrawTime - secondStartTime;
      let diffBetweenStartAndEndTime = secondEndTime - secondStartTime;
      let perSecondAmount = totalStreamedAmount / diffBetweenStartAndEndTime;
      let totalSpendTime = diffBetweenStartAndWithdrawTime;
      let expectedWithdrawAmount = perSecondAmount * totalSpendTime;
      let zebecFee = parseInt(
        ((expectedWithdrawAmount / 100) * 0.25).toString()
      );
      let expectedZebecVaultBalance =
        zebecVaultBalanceBeforeWithdraw - expectedWithdrawAmount;
      let expectedReceiverBalance =
        receiverBalanceBeforeWithdraw + expectedWithdrawAmount - zebecFee;
      assert.equal(withdrawAmount, expectedWithdrawAmount);
      assert.equal(receiverBalanceAfterWithdraw, expectedReceiverBalance);
      assert.equal(zebecVaultBalanceAfterWithdraw, expectedZebecVaultBalance);
    }
  });
});

import * as anchor from "@project-serum/anchor";
import {
  feeVault,
  create_fee_account,
  zebecVault,
  withdrawData,
} from "../../../src/Accounts";
import { assert } from "chai";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { airdropDelay, airdropSol, solFromProvider } from "../../../src/utils";
import { PREFIX, zebecProgram } from "../../../src/Constants";
import {
  getClusterTime,
  getNativeTokenBalance,
  getTxTime,
} from "../../../src/utils";
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
let pausedAt: anchor.BN;
let paused: anchor.BN;
let resumed: anchor.BN;
let resumedAt: anchor.BN;
let firstWithdrawAmount: anchor.BN;
let firstWithdrawTime: anchor.BN;

const amount = new anchor.BN(2 * LAMPORTS_PER_SOL);

console.log("Sender key: " + sender.publicKey.toBase58());
console.log("Receiver key: " + receiver.publicKey.toBase58());
console.log("DataAccount key: " + dataAccount.publicKey.toBase58());

describe("zebec native startWithDrawPauseResumeWithDrawAfterEnd", () => {
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
    const amount = new anchor.BN(5 * LAMPORTS_PER_SOL);
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
  it("Withdraw Sol", async () => {
    await airdropDelay(1000);
    let zebecVaultAddress = await zebecVault(sender.publicKey);
    let receiverBalanceBeforeWithdraw = await getNativeTokenBalance(
      receiver.publicKey,
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
    const data_account = await zebecProgram.account.stream.fetch(
      dataAccount.publicKey
    );
    firstWithdrawAmount = data_account.withdrawn;
    firstWithdrawTime = await getTxTime(tx, provider);
    let withdrawAmount = data_account.withdrawn.toString();
    let totalStreamedAmount = data_account.amount.toString();
    console.log(
      "case 1==> start the stream and the withdraw",
      firstWithdrawTime < endTime
    );
    let receiverBalanceAfterWithdraw = await getNativeTokenBalance(
      receiver.publicKey,
      provider
    );
    let zebecVaultBalanceAfterWithdraw = await getNativeTokenBalance(
      zebecVaultAddress,
      provider
    );
    let totalSpendTime = firstWithdrawTime - startTime;
    let diffBetweenStartAndEndTime = endTime - startTime;
    let perSecondAmount = totalStreamedAmount / diffBetweenStartAndEndTime;
    let expectedWithdrawAmount = parseInt(
      (perSecondAmount * totalSpendTime).toString()
    );
    let zebecFee = parseInt(((expectedWithdrawAmount / 100) * 0.25).toString());
    let expectedZebecVaultBalance =
      zebecVaultBalanceBeforeWithdraw - expectedWithdrawAmount;
    let expectedReceiverBalance =
      receiverBalanceBeforeWithdraw + expectedWithdrawAmount - zebecFee;
    assert.equal(withdrawAmount, expectedWithdrawAmount);
    assert.equal(receiverBalanceAfterWithdraw, expectedReceiverBalance);
    assert.equal(zebecVaultBalanceAfterWithdraw, expectedZebecVaultBalance);
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
    paused = "1";
    pausedAt = await getTxTime(tx, provider);
  });
  it("Resume Stream", async () => {
    await airdropDelay(5000);
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
    resumed = "1";
    resumedAt = await getTxTime(tx, provider);
  });
  it("Withdraw Sol", async () => {
    let zebecVaultAddress = await zebecVault(sender.publicKey);
    let receiverBalanceBeforeWithdraw = await getNativeTokenBalance(
      receiver.publicKey,
      provider
    );
    let zebecVaultBalanceBeforeWithdraw = await getNativeTokenBalance(
      zebecVaultAddress,
      provider
    );
    let currentTime = await getClusterTime(provider.connection);
    let timeRemainToEnd = endTime - currentTime;
    await airdropDelay((timeRemainToEnd + 14) * 1000);

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
    let withDrawTime = await getTxTime(tx, provider);
    if (paused == "1") {
      console.log(
        "case 2==> its withdraw then paused and resume and then again withdraw time is less than end time",
        withDrawTime < endTime
      );
      let receiverBalanceAfterWithdraw = await getNativeTokenBalance(
        receiver.publicKey,
        provider
      );
      let zebecVaultBalanceAfterWithdraw = await getNativeTokenBalance(
        zebecVaultAddress,
        provider
      );
      let diffBetweenResumeAndPauseTime = resumedAt - pausedAt;
      let diffBetweenStartAndEndTime = endTime - startTime;
      let perSecondAmount = amount / diffBetweenStartAndEndTime;
      let totalSpendTime =
        diffBetweenStartAndEndTime - diffBetweenResumeAndPauseTime;
      let secondWithdrawAmount =
        perSecondAmount * totalSpendTime - firstWithdrawAmount;
      let zebecFee = (secondWithdrawAmount / 100) * 0.25;
      let expectedZebecVaultBalance =
        zebecVaultBalanceBeforeWithdraw - secondWithdrawAmount;
      let expectedReceiverBalance =
        Number(receiverBalanceBeforeWithdraw) + secondWithdrawAmount - zebecFee;
      assert.equal(receiverBalanceAfterWithdraw, expectedReceiverBalance);
      assert.equal(zebecVaultBalanceAfterWithdraw, expectedZebecVaultBalance);
    }
  });
});

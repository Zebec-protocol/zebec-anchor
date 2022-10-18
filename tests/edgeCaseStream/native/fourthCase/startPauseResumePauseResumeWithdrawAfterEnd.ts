import * as anchor from "@project-serum/anchor";
import {
  feeVault,
  create_fee_account,
  zebecVault,
  withdrawData,
} from "../../../src/Accounts";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { assert } from "chai";
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

let firstPausedAt: anchor.BN;
let secondPausedAt: anchor.BN;
let secondPaused: anchor.BN;
let firstPaused: anchor.BN;
let firstResumed: anchor.BN;
let secondResumed: anchor.BN;
let firstResumeAt: anchor.BN;
let secondResumeAt: anchor.BN;
let startTime: anchor.BN;
let endTime: anchor.BN;
const amount = new anchor.BN(3 * LAMPORTS_PER_SOL);

console.log("Sender key: " + sender.publicKey.toBase58());
console.log("Receiver key: " + receiver.publicKey.toBase58());
console.log("DataAccount key: " + dataAccount.publicKey.toBase58());

describe("zebec native startPauseResumePauseResumeWithdrawAfterEnd", () => {
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
    endTime = new anchor.BN(now + 50);
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

  it("First Pause Stream Token", async () => {
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
    firstPaused = "1";
    firstPausedAt = await getTxTime(tx, provider);
  });
  it("First Resume Stream Token", async () => {
    await airdropDelay(4000);
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
    firstResumed = "1";
    firstResumeAt = await getTxTime(tx, provider);
  });
  it("Second Pause Stream Token", async () => {
    await airdropDelay(5300);
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
    secondPaused = "1";
    secondPausedAt = await getTxTime(tx, provider);
  });
  it("Second Resume Stream Token", async () => {
    await airdropDelay(6400);
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
    secondResumed = "1";
    secondResumeAt = await getTxTime(tx, provider);
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
    await airdropDelay((timeRemainToEnd + 4) * 1000);
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
    if (firstPaused == "1" && secondPaused == "1") {
      // let withdrawAmount = data_account.withdrawn.toString();
      console.log(
        "case 1==> its paused and resume and again pause and resume and then withdraw time is greater than end time",
        withDrawTime > endTime
      );
      let receiverBalanceAfterWithdraw = await getNativeTokenBalance(
        receiver.publicKey,
        provider
      );
      let zebecVaultBalanceAfterWithdraw = await getNativeTokenBalance(
        zebecVaultAddress,
        provider
      );
      let diffBetweenFirstResumeAndPauseTime = firstResumeAt - firstPausedAt;
      let diffBetweenSecondResumeAndPauseTime = secondResumeAt - secondPausedAt;
      let diffBetweenStartAndEndTime = endTime - startTime;
      let perSecondAmount = amount / diffBetweenStartAndEndTime;
      let totalSpendTime =
        diffBetweenStartAndEndTime -
        diffBetweenFirstResumeAndPauseTime -
        diffBetweenSecondResumeAndPauseTime;
      let expectedWithdrawAmount = Number(
        (perSecondAmount * totalSpendTime).toFixed()
      );
      let zebecFee = parseInt(
        ((expectedWithdrawAmount / 100) * 0.25).toString()
      );
      let expectedZebecVaultBalance = (
        zebecVaultBalanceBeforeWithdraw - expectedWithdrawAmount
      ).toFixed();
      let expectedReceiverBalance = (
        receiverBalanceBeforeWithdraw +
        expectedWithdrawAmount -
        zebecFee
      ).toFixed();
      assert.equal(receiverBalanceAfterWithdraw, expectedReceiverBalance);
      assert.equal(zebecVaultBalanceAfterWithdraw, expectedZebecVaultBalance);
    }
  });
});

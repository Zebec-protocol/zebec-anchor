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
let dataAccount1 = anchor.web3.Keypair.generate();

//user accounts
const sender = anchor.web3.Keypair.generate();
const receiver = anchor.web3.Keypair.generate();
const receiver1 = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();

let startTime: anchor.BN;
let secondStreamStartTime: anchor.BN;
let secondStreamEndTime: anchor.BN;
let endTime: anchor.BN;
let pausedAt: anchor.BN;
let resumedAt: anchor.BN;

const amount = new anchor.BN(2 * LAMPORTS_PER_SOL);

console.log("Sender key: " + sender.publicKey.toBase58());
console.log("Receiver key: " + receiver.publicKey.toBase58());
console.log("DataAccount key: " + dataAccount.publicKey.toBase58());

describe("zebec native checkedWithMultipleStreamEndTimePassed", () => {
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
    const amount = new anchor.BN(4 * LAMPORTS_PER_SOL);
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
    endTime = new anchor.BN(now + 30);
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
  it("Second Stream Sol", async () => {
    let now = await getClusterTime(provider.connection);
    secondStreamStartTime = new anchor.BN(now);
    secondStreamEndTime = new anchor.BN(now + 20);
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;
    let canCancel = true;
    let canUpdate = true;
    const tx = await zebecProgram.rpc.nativeStream(
      secondStreamStartTime,
      secondStreamEndTime,
      amount,
      canCancel,
      canUpdate,
      {
        accounts: {
          dataAccount: dataAccount1.publicKey,
          withdrawData: await withdrawData(PREFIX, sender.publicKey),
          feeOwner: fee_receiver.publicKey,
          feeVaultData: await create_fee_account(fee_receiver.publicKey),
          feeVault: await feeVault(fee_receiver.publicKey),
          systemProgram: anchor.web3.SystemProgram.programId,
          sender: sender.publicKey,
          receiver: receiver1.publicKey,
        },
        instructions: [
          await zebecProgram.account.stream.createInstruction(
            dataAccount1,
            dataSize
          ),
        ],
        signers: [sender, dataAccount1],
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
        withdrawData: await withdrawData(PREFIX, sender.publicKey),
      },
      signers: [sender],
      instructions: [],
    });
    console.log("Your transaction signature", tx);
    pausedAt = await getTxTime(tx, provider);
  });
  it("Pause Second Stream", async () => {
    await airdropDelay(3300);
    const tx = await zebecProgram.rpc.pauseStream({
      accounts: {
        sender: sender.publicKey,
        receiver: receiver1.publicKey,
        dataAccount: dataAccount1.publicKey,
        withdrawData: await withdrawData(PREFIX, sender.publicKey),
      },
      signers: [sender],
      instructions: [],
    });
    console.log("Your transaction signature", tx);
    secondStreamPausedAt = await getTxTime(tx, provider);
  });

  it("Resume Stream", async () => {
    await airdropDelay(2000);
    const withdraw_data_before_resume = await withdrawData(
      PREFIX,
      sender.publicKey
    );
    const withdraw_state_info_before_resume =
      await zebecProgram.account.solWithdraw.fetch(withdraw_data_before_resume);
    const withdraw_state_info_before_resume_amount =
      withdraw_state_info_before_resume.amount.toString();
    const tx = await zebecProgram.rpc.pauseStream({
      accounts: {
        sender: sender.publicKey,
        receiver: receiver.publicKey,
        dataAccount: dataAccount.publicKey,
        withdrawData: await withdrawData(PREFIX, sender.publicKey),
      },
      signers: [sender],
      instructions: [],
    });
    console.log("Your transaction signature", tx);
    const data_account_after_resume = await zebecProgram.account.stream.fetch(
      dataAccount.publicKey
    );

    const data_account_pauseamount_after_resume =
      data_account_after_resume.pausedAmt.toString();

    const withdraw_data_after_resume = await withdrawData(
      PREFIX,
      sender.publicKey
    );
    const withdraw_state_info_after_resume =
      await zebecProgram.account.solWithdraw.fetch(withdraw_data_after_resume);
    const withdraw_state_info_after_resume_amount =
      withdraw_state_info_after_resume.amount.toString();

    resumedAt = await getTxTime(tx, provider);
    assert.equal(
      withdraw_state_info_before_resume_amount -
        data_account_pauseamount_after_resume,
      withdraw_state_info_after_resume_amount
    );
  });
  it("Withdraw Sol", async () => {
    let zebecVaultAddress = await zebecVault(sender.publicKey);

    let zebecVaultBalanceBeforeWithdraw = await getNativeTokenBalance(
      zebecVaultAddress,
      provider
    );
    let receiverBalanceBeforeWithdraw = await getNativeTokenBalance(
      receiver.publicKey,
      provider
    );
    let currentTime = await getClusterTime(provider.connection);
    let timeRemainToEnd = endTime - currentTime;

    await airdropDelay((timeRemainToEnd + 4) * 1000);
    const withdraw_data_before_withdraw = await withdrawData(
      PREFIX,
      sender.publicKey
    );
    const withdraw_state_info_before_withdraw =
      await zebecProgram.account.solWithdraw.fetch(
        withdraw_data_before_withdraw
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
    const data_account_second_stream_after_withdraw =
      await zebecProgram.account.stream.fetch(dataAccount1.publicKey);
    const data_account_second_stream_pauseamount_after_withdraw =
      data_account_second_stream_after_withdraw.pausedAmt.toString();
    const withdraw_data_after_withdraw = await withdrawData(
      PREFIX,
      sender.publicKey
    );
    const withdraw_state_info_after_withdraw =
      await zebecProgram.account.solWithdraw.fetch(
        withdraw_data_after_withdraw
      );

    let totalStreamedAmount = amount.toString();
    console.log(
      "case 1==> its paused and resume and withdraw time is greater than end time"
    );

    let diffBetweenResumeAndPauseTime = resumedAt - pausedAt;
    let diffBetweenStartAndEndTime = endTime - startTime;

    let perSecondAmount = totalStreamedAmount / diffBetweenStartAndEndTime;

    let totalSpendTime =
      diffBetweenStartAndEndTime - diffBetweenResumeAndPauseTime;

    let totalSpendAmount =
      totalSpendTime * parseInt(perSecondAmount.toString());
    let zebecFee = parseInt(((totalSpendAmount / 100) * 0.25).toString());

    assert.equal(
      withdraw_state_info_after_withdraw.amount.toString(),
      amount.toString()
    );
  });
});

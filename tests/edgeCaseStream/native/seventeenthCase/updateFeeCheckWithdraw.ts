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
const fee_receiver = new anchor.web3.Keypair();

let startTime: anchor.BN;
let endTime: anchor.BN;
let startTimeSecond: anchor.BN;
let endTimeSecond: anchor.BN;

const amount = new anchor.BN(4000000000);

console.log("Sender key: " + sender.publicKey.toBase58());
console.log("Receiver key: " + receiver.publicKey.toBase58());
console.log("DataAccount key: " + dataAccount.publicKey.toBase58());

describe("zebec native updateFeeCheckWithdraw", () => {
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
    const amount = new anchor.BN(3500000000);
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
    endTime = new anchor.BN(now + 200);
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
  it("Second Stream Sol", async () => {
    let now = await getClusterTime(provider.connection);
    startTimeSecond = new anchor.BN(now);
    endTimeSecond = new anchor.BN(now + 200);
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;
    let canCancel = true;
    let canUpdate = true;
    const tx = await zebecProgram.rpc.nativeStream(
      startTimeSecond,
      endTimeSecond,
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
          receiver: receiver.publicKey,
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
    let withDrawTime = await getTxTime(tx, provider);
    let withdrawAmount = data_account.withdrawn.toString();
    let totalStreamedAmount = data_account.amount.toString();

    let receiverBalanceAfterWithdraw = await getNativeTokenBalance(
      receiver.publicKey,
      provider
    );
    let zebecVaultBalanceAfterWithdraw = await getNativeTokenBalance(
      zebecVaultAddress,
      provider
    );
    let totalSpendTime = withDrawTime - startTime;
    let diffBetweenStartAndEndTime = endTime - startTime;
    let perSecondAmount = totalStreamedAmount / diffBetweenStartAndEndTime;
    let expectedWithdrawAmount = perSecondAmount * totalSpendTime;
    let zebecFee = parseInt(((expectedWithdrawAmount / 100) * 0.25).toString());
    let expectedZebecVaultBalance =
      zebecVaultBalanceBeforeWithdraw - expectedWithdrawAmount;
    let expectedReceiverBalance =
      receiverBalanceBeforeWithdraw + expectedWithdrawAmount - zebecFee;
    assert.equal(withdrawAmount, expectedWithdrawAmount);
    assert.equal(receiverBalanceAfterWithdraw, expectedReceiverBalance);
    assert.equal(zebecVaultBalanceAfterWithdraw, expectedZebecVaultBalance);
  });
  it("Second Withdraw Sol", async () => {
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
        dataAccount: dataAccount1.publicKey,
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
      dataAccount1.publicKey
    );
    let withDrawTime = await getTxTime(tx, provider);
    let withdrawAmount = data_account.withdrawn.toString();
    let totalStreamedAmount = data_account.amount.toString();

    let receiverBalanceAfterWithdraw = await getNativeTokenBalance(
      receiver.publicKey,
      provider
    );
    let zebecVaultBalanceAfterWithdraw = await getNativeTokenBalance(
      zebecVaultAddress,
      provider
    );
    let totalSpendTime = withDrawTime - startTimeSecond;
    let diffBetweenStartAndEndTime = endTimeSecond - startTimeSecond;
    let perSecondAmount = totalStreamedAmount / diffBetweenStartAndEndTime;
    let expectedWithdrawAmount = perSecondAmount * totalSpendTime;
    let zebecFee = parseInt(((expectedWithdrawAmount / 100) * 0.2).toString());
    let expectedZebecVaultBalance =
      zebecVaultBalanceBeforeWithdraw - expectedWithdrawAmount;
    let expectedReceiverBalance =
      receiverBalanceBeforeWithdraw + expectedWithdrawAmount - zebecFee;
    assert.equal(withdrawAmount, expectedWithdrawAmount);
    assert.equal(receiverBalanceAfterWithdraw, expectedReceiverBalance);
    assert.equal(zebecVaultBalanceAfterWithdraw, expectedZebecVaultBalance);
  });
});

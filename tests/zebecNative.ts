import * as anchor from "@project-serum/anchor";
import { assert } from "chai";
import {
  feeVault,
  create_fee_account,
  zebecVault,
  withdrawData,
} from "./src/Accounts";
<<<<<<< HEAD
import {  getClusterTime, solFromProvider } from "./src/utils";
=======
import { getClusterTime, solFromProvider } from "./src/utils";
>>>>>>> master
import { PREFIX, STREAM_SIZE, zebecProgram } from "./src/Constants";
// Configure the client to use the local cluster.
const provider = anchor.Provider.env();
anchor.setProvider(provider);

let dataAccount = anchor.web3.Keypair.generate();

//user accounts
const sender = anchor.web3.Keypair.generate();
const receiver = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();

console.log("Sender key: " + sender.publicKey.toBase58());
console.log("Receiver key: " + receiver.publicKey.toBase58());
console.log("DataAccount key: " + dataAccount.publicKey.toBase58());

describe("zebec native", () => {
  it("Airdrop Solana", async () => {
    await solFromProvider(zebecProgram.provider, sender.publicKey, 2);
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
    const amount = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL);
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
    const startTime = new anchor.BN(now + 40);
    const endTime = new anchor.BN(now + 60);
    const amount = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL);
    const can_cancel = true;
    const can_update = true;
    const dataSize = STREAM_SIZE;
    const tx = await zebecProgram.rpc.nativeStream(
      startTime,
      endTime,
      amount,
      can_cancel,
      can_update,
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
    const data_account = await zebecProgram.account.stream.fetch(
      dataAccount.publicKey
    );

    assert.equal(data_account.startTime.toString(), startTime.toString());
    assert.equal(data_account.endTime.toString(), endTime.toString());
    assert.equal(data_account.amount.toString(), amount.toString());
    assert.equal(data_account.sender.toString(), sender.publicKey.toString());
    assert.equal(
      data_account.receiver.toString(),
      receiver.publicKey.toString()
    );
    assert.equal(data_account.paused.toString(), "0");

   
    const withdraw_info = await zebecProgram.account.solWithdraw.fetch(
      await withdrawData(PREFIX, sender.publicKey)
    );
    console.log("The streamed amount is %s",withdraw_info.amount.toString());
    assert.equal(withdraw_info.amount.toString(), amount.toString());
    const data_create_set = await zebecProgram.account.feeVaultData.fetch(
      await create_fee_account(fee_receiver.publicKey)
    );
    assert.equal(data_account.feePercentage.toString(),data_create_set.feePercentage.toString());
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
  it("Verify Fee Percentage unchanged in Stream", async () => {
    const data_create_set = await zebecProgram.account.feeVaultData.fetch(
      await create_fee_account(fee_receiver.publicKey)
    );
    const data_account = await zebecProgram.account.stream.fetch(
      dataAccount.publicKey
    );
    assert.notEqual(data_account.feePercentage.toString(),data_create_set.feePercentage.toString());
  });
  it("Update Stream", async () => {
    let now = await getClusterTime(provider.connection);
    const startTime = new anchor.BN(now - 40);
    const endTime = new anchor.BN(now + 40);
    const amount = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL);
    const tx = await zebecProgram.rpc.nativeStreamUpdate(
      startTime,
      endTime,
      amount,
      {
        accounts: {
          dataAccount: dataAccount.publicKey,
          withdrawData: await withdrawData(PREFIX, sender.publicKey),
          systemProgram: anchor.web3.SystemProgram.programId,
          sender: sender.publicKey,
          receiver: receiver.publicKey,
        },
        signers: [sender],
      }
    );
    console.log("Your transaction signature", tx);
    const data_account = await zebecProgram.account.stream.fetch(
      dataAccount.publicKey
    );

    assert.equal(data_account.startTime.toString(), startTime.toString());
    assert.equal(data_account.endTime.toString(), endTime.toString());
    assert.equal(data_account.amount.toString(), amount.toString());
    assert.equal(data_account.sender.toString(), sender.publicKey.toString());
    assert.equal(
      data_account.receiver.toString(),
      receiver.publicKey.toString()
    );
    assert.equal(data_account.paused.toString(), "0");
  });
  it("Pause Stream", async () => {
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
  it("Resume Stream", async () => {
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
    const tx = await zebecProgram.rpc.withdrawStream({
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
      signers: [receiver],
    });
    console.log("Your transaction signature", tx);
  });
  it("Instant Transfer", async () => {
    const amount = new anchor.BN(25);
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
  });
  it("Cancel Sol Stream", async () => {
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
    console.log("Your transaction signature", tx);
  });
  it("Initializer Withdrawal Sol", async () => {
    const amount = new anchor.BN(100);
    const tx = await zebecProgram.rpc.nativeWithdrawal(amount, {
      accounts: {
        zebecVault: await zebecVault(sender.publicKey),
        withdrawData: await withdrawData(PREFIX, sender.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
        sender: sender.publicKey,
      },
      signers: [sender],
    });
    console.log("Your transaction signature", tx);
  });
  it("Retrieve Fees", async () => {
    const tx = await zebecProgram.rpc.withdrawFeesSol({
      accounts: {
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [fee_receiver],
      instructions: [],
    });
    console.log("Your transaction signature is ", tx);
  });
});

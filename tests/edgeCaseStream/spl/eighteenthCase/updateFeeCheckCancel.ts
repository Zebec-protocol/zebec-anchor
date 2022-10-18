import * as anchor from "@project-serum/anchor";
import { assert } from "chai";
import * as spl from "@solana/spl-token";
import { airdropDelay, airdropSol, solFromProvider } from "../../../src/utils";
import {
  getTokenBalance,
  createMint,
  createUserAndAssociatedWallet,
  feeVault,
  create_fee_account,
  zebecVault,
  withdrawData,
} from "../../../src/Accounts";
import { PREFIX_TOKEN, zebecProgram } from "../../../src/Constants";
import {
  getBalanceOfSplToken,
  getClusterTime,
  getTxTime,
} from "../../../src/utils";
// Configure the client to use the local cluster.
const provider = anchor.Provider.env();
anchor.setProvider(provider);

//data account
const dataAccount = anchor.web3.Keypair.generate();
const dataAccount1 = anchor.web3.Keypair.generate();
//token mint
const tokenMint = new anchor.web3.Keypair();
//users account
const sender = anchor.web3.Keypair.generate();
const receiver = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();
let startTime: anchor.BN;
let endTime: anchor.BN;
let startTimeSecond: anchor.BN;
let endTimeSecond: anchor.BN;

const amount = new anchor.BN(1000000);
describe("zebec token updateFeeCheckCancel", () => {
  it("Airdrop Solana", async () => {
    await solFromProvider(zebecProgram.provider, sender.publicKey, 3);
    await solFromProvider(zebecProgram.provider, receiver.publicKey, 1);
    await solFromProvider(zebecProgram.provider, fee_receiver.publicKey, 1);
  });
  it("Create Set Vault", async () => {
    //for 0.25 % fee percentage should be sent 25
    //which is divided by 10000 to get 0.25%
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
    console.log("Your signature for create vault is ", tx);

    const data_create_set = await zebecProgram.account.feeVaultData.fetch(
      await create_fee_account(fee_receiver.publicKey)
    );
    assert.equal(
      data_create_set.feeVaultAddress.toString(),
      (await feeVault(fee_receiver.publicKey)).toString()
    );
    assert.equal(
      data_create_set.feeOwner.toString(),
      fee_receiver.publicKey.toString()
    );
    assert.equal(
      data_create_set.feePercentage.toString(),
      fee_percentage.toString()
    );
  });
  it("Token Deposit", async () => {
    await createMint(provider, tokenMint);
    const source_token_account = await createUserAndAssociatedWallet(
      provider,
      sender,
      tokenMint.publicKey
    );
    const pda_token_account = await spl.getAssociatedTokenAddress(
      tokenMint.publicKey,
      await zebecVault(sender.publicKey),
      true,
      spl.TOKEN_PROGRAM_ID,
      spl.ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const amount = new anchor.BN(16000000);
    const tx = await zebecProgram.rpc.depositToken(amount, {
      accounts: {
        zebecVault: await zebecVault(sender.publicKey),
        sourceAccount: sender.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        mint: tokenMint.publicKey,
        sourceAccountTokenAccount: source_token_account,
        pdaAccountTokenAccount: pda_token_account,
      },
      signers: [sender],
      instructions: [],
    });
    console.log("Your transaction for deposit token signature", tx);
    const tokenbalance = await getTokenBalance(
      provider.connection,
      pda_token_account
    );
    assert.equal(tokenbalance.toString(), amount.toString());
  });
  it("Token Stream", async () => {
    let now = await getClusterTime(provider.connection);
    startTime = new anchor.BN(now);
    endTime = new anchor.BN(now + 120);
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;
    let canCancel = true;
    let canUpdate = true;
    const tx = await zebecProgram.rpc.tokenStream(
      startTime,
      endTime,
      amount,
      canCancel,
      canUpdate,
      {
        accounts: {
          dataAccount: dataAccount.publicKey,
          withdrawData: await withdrawData(
            PREFIX_TOKEN,
            sender.publicKey,
            tokenMint.publicKey
          ),
          feeOwner: fee_receiver.publicKey,
          feeVaultData: await create_fee_account(fee_receiver.publicKey),
          feeVault: await feeVault(fee_receiver.publicKey),
          sourceAccount: sender.publicKey,
          destAccount: receiver.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          mint: tokenMint.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        instructions: [
          await zebecProgram.account.streamToken.createInstruction(
            dataAccount,
            dataSize
          ),
        ],
        signers: [sender, dataAccount],
      }
    );
    console.log("Your transaction for token stream signature", tx);
    const data_account = await zebecProgram.account.streamToken.fetch(
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

    const withdraw_info = await zebecProgram.account.tokenWithdraw.fetch(
      await withdrawData(PREFIX_TOKEN, sender.publicKey, tokenMint.publicKey)
    );
    assert.equal(withdraw_info.amount.toString(), amount.toString());
  });

  it("Update Fee Percentage", async () => {
    const fee_percentage = new anchor.BN(30);
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
  it("Second Token Stream", async () => {
    let now = await getClusterTime(provider.connection);
    startTimeSecond = new anchor.BN(now);
    endTimeSecond = new anchor.BN(now + 120);
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;
    let canCancel = true;
    let canUpdate = true;
    const tx = await zebecProgram.rpc.tokenStream(
      startTimeSecond,
      endTimeSecond,
      amount,
      canCancel,
      canUpdate,
      {
        accounts: {
          dataAccount: dataAccount1.publicKey,
          withdrawData: await withdrawData(
            PREFIX_TOKEN,
            sender.publicKey,
            tokenMint.publicKey
          ),
          feeOwner: fee_receiver.publicKey,
          feeVaultData: await create_fee_account(fee_receiver.publicKey),
          feeVault: await feeVault(fee_receiver.publicKey),
          sourceAccount: sender.publicKey,
          destAccount: receiver.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          mint: tokenMint.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        instructions: [
          await zebecProgram.account.streamToken.createInstruction(
            dataAccount1,
            dataSize
          ),
        ],
        signers: [sender, dataAccount1],
      }
    );
    console.log("Your transaction for token stream signature", tx);
    const data_account = await zebecProgram.account.streamToken.fetch(
      dataAccount1.publicKey
    );

    assert.equal(data_account.startTime.toString(), startTimeSecond.toString());
    assert.equal(data_account.endTime.toString(), endTimeSecond.toString());
    assert.equal(data_account.amount.toString(), amount.toString());
    assert.equal(data_account.sender.toString(), sender.publicKey.toString());
    assert.equal(
      data_account.receiver.toString(),
      receiver.publicKey.toString()
    );
    assert.equal(data_account.paused.toString(), "0");
  });
  it("Cancel Token Stream", async () => {
    await airdropDelay(3300);
    let zebecVaultAddress = await zebecVault(sender.publicKey);
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

    let receiverBalanceBeforeCancel = await getBalanceOfSplToken(
      tokenMint.publicKey,
      receiver.publicKey,
      provider
    );
    let zebecVaultBalanceBeforeCancel = await getBalanceOfSplToken(
      tokenMint.publicKey,
      zebecVaultAddress,
      provider
    );
    const data_account = await zebecProgram.account.streamToken.fetch(
      dataAccount.publicKey
    );
    let dataAccountAmount = data_account.amount.toString();
    let dataAccountWithdrawn = data_account.withdrawn.toString();
    let dataAccountSol = await provider.connection.getBalance(
      dataAccount.publicKey
    );
    const withdraw_data_before_cancel = await withdrawData(
      PREFIX_TOKEN,
      sender.publicKey,
      tokenMint.publicKey
    );
    const withdraw_state_info_before_cancel =
      await zebecProgram.account.tokenWithdraw.fetch(
        withdraw_data_before_cancel
      );
    let senderBalanceBeforeCancelNative = await provider.connection.getBalance(
      sender.publicKey
    );
    const tx = await zebecProgram.rpc.cancelTokenStream({
      accounts: {
        destAccount: receiver.publicKey,
        sourceAccount: sender.publicKey,
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        zebecVault: zebecVaultAddress,
        dataAccount: dataAccount.publicKey,
        withdrawData: await withdrawData(
          PREFIX_TOKEN,
          sender.publicKey,
          tokenMint.publicKey
        ),
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        mint: tokenMint.publicKey,
        pdaAccountTokenAccount: pda_token_account,
        destTokenAccount: dest_token_account,
        feeReceiverTokenAccount: fee_token_account,
      },
      signers: [sender],
    });
    let cancelTxTime = await getTxTime(tx, provider);
    console.log("Your signature for cancel token stream is ", tx);

    const withdraw_data_after_cancel = await withdrawData(
      PREFIX_TOKEN,
      sender.publicKey,
      tokenMint.publicKey
    );
    const withdraw_state_info_after_cancel =
      await zebecProgram.account.tokenWithdraw.fetch(
        withdraw_data_after_cancel
      );
    let diffOfWithdrawStateInfoAmount =
      withdraw_state_info_before_cancel.amount.toString() -
      withdraw_state_info_after_cancel.amount.toString();
    let zebecVaultBalanceAfterCancel = await getBalanceOfSplToken(
      tokenMint.publicKey,
      zebecVaultAddress,
      provider
    );

    let receiverBalanceAfterCancel = await getBalanceOfSplToken(
      tokenMint.publicKey,
      receiver.publicKey,
      provider
    );
    let diffBetweenStartAndEndTime = endTime - startTime;
    let diffBetweenStartAndCancel = cancelTxTime - startTime;
    let perSecondAmount = amount / diffBetweenStartAndEndTime;
    let totalSpendTime = diffBetweenStartAndCancel;
    let totalSpendAmount = totalSpendTime * perSecondAmount;
    let zebecFee = parseInt(((totalSpendAmount / 100) * 0.25).toString());

    let expectedReceiverBalance = Math.floor(
      Number(receiverBalanceBeforeCancel) +
        Number(totalSpendAmount) -
        Number(zebecFee)
    );
    let expectedZebecVaultBalance = Math.ceil(
      zebecVaultBalanceBeforeCancel - totalSpendAmount
    );

    assert.equal(
      diffOfWithdrawStateInfoAmount,
      Number(dataAccountAmount) - dataAccountWithdrawn
    );

    assert.equal(zebecVaultBalanceAfterCancel, expectedZebecVaultBalance);
    assert.equal(receiverBalanceAfterCancel, expectedReceiverBalance);
  });
  it("Cancel Second Token Stream", async () => {
    await airdropDelay(4300);
    let zebecVaultAddress = await zebecVault(sender.publicKey);
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
    let receiverBalanceBeforeCancel = await getBalanceOfSplToken(
      tokenMint.publicKey,
      receiver.publicKey,
      provider
    );
    let zebecVaultBalanceBeforeCancel = await getBalanceOfSplToken(
      tokenMint.publicKey,
      zebecVaultAddress,
      provider
    );
    const data_account = await zebecProgram.account.streamToken.fetch(
      dataAccount1.publicKey
    );
    let dataAccountAmount = data_account.amount.toString();
    let dataAccountWithdrawn = data_account.withdrawn.toString();
    let dataAccountSol = await provider.connection.getBalance(
      dataAccount1.publicKey
    );

    const withdraw_data_before_cancel = await withdrawData(
      PREFIX_TOKEN,
      sender.publicKey,
      tokenMint.publicKey
    );
    const withdraw_state_info_before_cancel =
      await zebecProgram.account.tokenWithdraw.fetch(
        withdraw_data_before_cancel
      );
    let senderBalanceBeforeCancelNative = await provider.connection.getBalance(
      sender.publicKey
    );
    const tx = await zebecProgram.rpc.cancelTokenStream({
      accounts: {
        destAccount: receiver.publicKey,
        sourceAccount: sender.publicKey,
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        zebecVault: zebecVaultAddress,
        dataAccount: dataAccount1.publicKey,
        withdrawData: await withdrawData(
          PREFIX_TOKEN,
          sender.publicKey,
          tokenMint.publicKey
        ),
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: spl.TOKEN_PROGRAM_ID,
        associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        mint: tokenMint.publicKey,
        pdaAccountTokenAccount: pda_token_account,
        destTokenAccount: dest_token_account,
        feeReceiverTokenAccount: fee_token_account,
      },
      signers: [sender],
    });
    let cancelTxTime = await getTxTime(tx, provider);
    console.log("Your signature for cancel token stream is ", tx);
    // if (paused == "1" && resumed == "1") {
    let senderBalanceAfterCancelNative = await provider.connection.getBalance(
      sender.publicKey
    );
    let balance = (
      (await getTokenBalance(provider.connection, fee_token_account)) -
      (await getTokenBalance(provider.connection, dest_token_account))
    ).toString();

    const withdraw_data_after_cancel = await withdrawData(
      PREFIX_TOKEN,
      sender.publicKey,
      tokenMint.publicKey
    );
    const withdraw_state_info_after_cancel =
      await zebecProgram.account.tokenWithdraw.fetch(
        withdraw_data_after_cancel
      );
    let diffOfWithdrawStateInfoAmount =
      withdraw_state_info_before_cancel.amount.toString() -
      withdraw_state_info_after_cancel.amount.toString();
    let zebecVaultBalanceAfterCancel = await getBalanceOfSplToken(
      tokenMint.publicKey,
      zebecVaultAddress,
      provider
    );

    let receiverBalanceAfterCancel = await getBalanceOfSplToken(
      tokenMint.publicKey,
      receiver.publicKey,
      provider
    );
    let diffBetweenStartAndEndTime = endTimeSecond - startTimeSecond;
    let diffBetweenStartAndCancel = cancelTxTime - startTimeSecond;
    let perSecondAmount = amount / diffBetweenStartAndEndTime;
    let totalSpendTime = diffBetweenStartAndCancel;
    let totalSpendAmount = totalSpendTime * perSecondAmount;
    let zebecFee = parseInt(((totalSpendAmount / 100) * 0.3).toString());
    let expectedReceiverBalance = Math.ceil(
      Number(receiverBalanceBeforeCancel) +
        Number(totalSpendAmount) -
        Number(zebecFee)
    );

    let expectedZebecVaultBalance = (
      zebecVaultBalanceBeforeCancel - totalSpendAmount
    ).toFixed();

    assert.equal(
      diffOfWithdrawStateInfoAmount,
      Number(dataAccountAmount) - dataAccountWithdrawn
    );
    assert.equal(
      senderBalanceAfterCancelNative,
      Number(dataAccountSol) + senderBalanceBeforeCancelNative
    );
    assert.equal(zebecVaultBalanceAfterCancel, expectedZebecVaultBalance);
    assert.equal(receiverBalanceAfterCancel, expectedReceiverBalance);
    // }
  });
});

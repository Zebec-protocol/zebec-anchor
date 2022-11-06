import * as anchor from "@project-serum/anchor";
import { assert } from "chai";
import * as spl from "@solana/spl-token";
import { airdropDelay, solFromProvider } from "../../../src/utils";
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
//token mint
const tokenMint = new anchor.web3.Keypair();
//users account
const sender = anchor.web3.Keypair.generate();
const receiver = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();
let startTime: anchor.BN;
let endTime: anchor.BN;
let pausedAt: anchor.BN;
let paused: anchor.BN;
let resumedAt: anchor.BN;

const amount = new anchor.BN(5000000);
describe("zebec token checkStreamAmountBeforeEndtime", () => {
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
    endTime = new anchor.BN(now + 450);
    let canCancel = true;
    let canUpdate = true;
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;
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
  it("Pause Stream Token", async () => {
    await airdropDelay(5300);
    const tx = await zebecProgram.rpc.pauseResumeTokenStream({
      accounts: {
        sender: sender.publicKey,
        receiver: receiver.publicKey,
        dataAccount: dataAccount.publicKey,
        mint: tokenMint.publicKey,
        withdrawData: await withdrawData(
          PREFIX_TOKEN,
          sender.publicKey,
          tokenMint.publicKey
        ),
      },
      signers: [sender],
      instructions: [],
    });

    console.log("Your transaction for pause token stream signature", tx);
    const data_account = await zebecProgram.account.streamToken.fetch(
      dataAccount.publicKey
    );
    assert.equal(data_account.paused.toString(), "1");
    paused = data_account.paused;
    pausedAt = data_account.pausedAt;
  });
  it("Resume Stream Token", async () => {
    await airdropDelay(4000);
    const tx = await zebecProgram.rpc.pauseResumeTokenStream({
      accounts: {
        sender: sender.publicKey,
        receiver: receiver.publicKey,
        dataAccount: dataAccount.publicKey,
        mint: tokenMint.publicKey,
        withdrawData: await withdrawData(
          PREFIX_TOKEN,
          sender.publicKey,
          tokenMint.publicKey
        ),
      },
      signers: [sender],
      instructions: [],
    });

    console.log("Your transaction for resume token stream signature", tx);
    const data_account_after_resume =
      await zebecProgram.account.streamToken.fetch(dataAccount.publicKey);
    const data_account_after_resume_amount =
      data_account_after_resume.amount.toString();
    const data_account_pauseamount_after_resume =
      data_account_after_resume.pausedAmt.toString();

    const withdraw_data_after_resume = await withdrawData(
      PREFIX_TOKEN,
      sender.publicKey,
      tokenMint.publicKey
    );
    const withdraw_state_info_after_resume =
      await zebecProgram.account.tokenWithdraw.fetch(
        withdraw_data_after_resume
      );
    const withdraw_state_info_after_resume_amount =
      withdraw_state_info_after_resume.amount.toString();
    resumedAt = await getTxTime(tx, provider);
    assert.equal(
      data_account_after_resume_amount - data_account_pauseamount_after_resume,
      withdraw_state_info_after_resume_amount
    );
  });
  it("Withdraw Token Stream", async () => {
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
    let receiverBalanceBeforeWithdraw = await getBalanceOfSplToken(
      tokenMint.publicKey,
      receiver.publicKey,
      provider
    );
    let zebecVaultBalanceBeforeWithdraw = await getBalanceOfSplToken(
      tokenMint.publicKey,
      zebecVaultAddress,
      provider
    );
    const withdraw_data_before_withdraw = await withdrawData(
      PREFIX_TOKEN,
      sender.publicKey,
      tokenMint.publicKey
    );
    const withdraw_state_info_before_withdraw =
      await zebecProgram.account.tokenWithdraw.fetch(
        withdraw_data_before_withdraw
      );
    const tx = await zebecProgram.rpc.withdrawTokenStream({
      accounts: {
        destAccount: receiver.publicKey,
        sourceAccount: sender.publicKey,
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        zebecVault: await zebecVault(sender.publicKey),
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
      signers: [receiver],
    });
    console.log("Your signature for withdraw token stream is ", tx);
    let withDrawTime = await getTxTime(tx, provider);
    const data_account = await zebecProgram.account.streamToken.fetch(
      dataAccount.publicKey
    );
    const withdraw_data_after_withdraw = await withdrawData(
      PREFIX_TOKEN,
      sender.publicKey,
      tokenMint.publicKey
    );
    const withdraw_state_info_after_withdraw =
      await zebecProgram.account.tokenWithdraw.fetch(
        withdraw_data_after_withdraw
      );

    let withdrawAmount = data_account.withdrawn.toString();
    let totalStreamedAmount = data_account.amount.toString();

    let receiverBalanceAfterWithdraw = await getBalanceOfSplToken(
      tokenMint.publicKey,
      receiver.publicKey,
      provider
    );
    let zebecVaultBalanceAfterWithdraw = await getBalanceOfSplToken(
      tokenMint.publicKey,
      zebecVaultAddress,
      provider
    );
    let diffBetweenResumeAndPauseTime = resumedAt - pausedAt;
    let diffBetweenStartAndWithdrawTime = withDrawTime - startTime;
    let diffBetweenStartAndEndTime = endTime - startTime;
    let perSecondAmount = totalStreamedAmount / diffBetweenStartAndEndTime;
    let totalSpendTime =
      diffBetweenStartAndWithdrawTime - diffBetweenResumeAndPauseTime;
    let expectedWithdrawAmount =
      parseInt(perSecondAmount.toString()) * totalSpendTime;
    let zebecFee = parseInt(((expectedWithdrawAmount / 100) * 0.25).toString());
    let expectedZebecVaultBalance =
      zebecVaultBalanceBeforeWithdraw - expectedWithdrawAmount;
    let expectedReceiverBalance =
      receiverBalanceBeforeWithdraw + expectedWithdrawAmount - zebecFee;
    const expectedStreamedAmount =
      withdraw_state_info_before_withdraw.amount.toString() -
      data_account.withdrawn.toString();
    assert.equal(
      withdraw_state_info_after_withdraw.amount.toString(),
      expectedStreamedAmount.toString()
    );
    assert.equal(withdrawAmount, expectedWithdrawAmount);
    assert.equal(receiverBalanceAfterWithdraw, expectedReceiverBalance);
    assert.equal(zebecVaultBalanceAfterWithdraw, expectedZebecVaultBalance);
  });
});

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
const firstDataAccount = anchor.web3.Keypair.generate();
const secondDataAccount = anchor.web3.Keypair.generate();
//token mint
const tokenMint = new anchor.web3.Keypair();
//users account
const sender = anchor.web3.Keypair.generate();
const receiver = anchor.web3.Keypair.generate();
const secondReceiver = anchor.web3.Keypair.generate();
const fee_receiver = new anchor.web3.Keypair();
let firstStartTime: anchor.BN;
let firstEndTime: anchor.BN;
let secondStartTime: anchor.BN;
let secondEndTime: anchor.BN;
let pausedAt: anchor.BN;
let paused: anchor.BN;
let resumedAt: anchor.BN;

const firstStreamedAmount = new anchor.BN(748000000);
const secondStreamedAmount = new anchor.BN(248000000);
describe("zebec token StreamWithTwoReceiver", () => {
  it("Airdrop Solana", async () => {
    await solFromProvider(zebecProgram.provider, sender.publicKey, 3);
    await solFromProvider(zebecProgram.provider, receiver.publicKey, 1);
    await solFromProvider(zebecProgram.provider, secondReceiver.publicKey, 1);
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
    const amount = new anchor.BN(1111000000);
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
  it("First Token Stream", async () => {
    let now = await getClusterTime(provider.connection);
    firstStartTime = new anchor.BN(now);
    firstEndTime = new anchor.BN(now + 450);
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;
    let canCancel = true;
    let canUpdate = true;
    const tx = await zebecProgram.rpc.tokenStream(
      firstStartTime,
      firstEndTime,
      firstStreamedAmount,
      canCancel,
      canUpdate,
      {
        accounts: {
          dataAccount: firstDataAccount.publicKey,
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
            firstDataAccount,
            dataSize
          ),
        ],
        signers: [sender, firstDataAccount],
      }
    );
    console.log("Your transaction for token stream signature", tx);
    const data_account = await zebecProgram.account.streamToken.fetch(
      firstDataAccount.publicKey
    );

    assert.equal(data_account.startTime.toString(), firstStartTime.toString());
    assert.equal(data_account.endTime.toString(), firstEndTime.toString());
    assert.equal(
      data_account.amount.toString(),
      firstStreamedAmount.toString()
    );
    assert.equal(data_account.sender.toString(), sender.publicKey.toString());
    assert.equal(
      data_account.receiver.toString(),
      receiver.publicKey.toString()
    );
    assert.equal(data_account.paused.toString(), "0");

    const withdraw_info = await zebecProgram.account.tokenWithdraw.fetch(
      await withdrawData(PREFIX_TOKEN, sender.publicKey, tokenMint.publicKey)
    );
    assert.equal(
      withdraw_info.amount.toString(),
      firstStreamedAmount.toString()
    );
  });
  it("Second Token Stream", async () => {
    await airdropDelay(10000);
    let now = await getClusterTime(provider.connection);
    secondStartTime = new anchor.BN(now);
    secondEndTime = new anchor.BN(now + 450);
    const dataSize = 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 200;
    let canCancel = true;
    let canUpdate = true;
    const tx = await zebecProgram.rpc.tokenStream(
      secondStartTime,
      secondEndTime,
      secondStreamedAmount,
      canCancel,
      canUpdate,
      {
        accounts: {
          dataAccount: secondDataAccount.publicKey,
          withdrawData: await withdrawData(
            PREFIX_TOKEN,
            sender.publicKey,
            tokenMint.publicKey
          ),
          feeOwner: fee_receiver.publicKey,
          feeVaultData: await create_fee_account(fee_receiver.publicKey),
          feeVault: await feeVault(fee_receiver.publicKey),
          sourceAccount: sender.publicKey,
          destAccount: secondReceiver.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          mint: tokenMint.publicKey,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        instructions: [
          await zebecProgram.account.streamToken.createInstruction(
            secondDataAccount,
            dataSize
          ),
        ],
        signers: [sender, secondDataAccount],
      }
    );
    console.log("Your transaction for token stream signature", tx);
    const data_account = await zebecProgram.account.streamToken.fetch(
      secondDataAccount.publicKey
    );

    assert.equal(data_account.startTime.toString(), secondStartTime.toString());
    assert.equal(data_account.endTime.toString(), secondEndTime.toString());
    assert.equal(
      data_account.amount.toString(),
      secondStreamedAmount.toString()
    );
    assert.equal(data_account.sender.toString(), sender.publicKey.toString());
    assert.equal(
      data_account.receiver.toString(),
      secondReceiver.publicKey.toString()
    );
    assert.equal(data_account.paused.toString(), "0");

    const withdraw_info = await zebecProgram.account.tokenWithdraw.fetch(
      await withdrawData(PREFIX_TOKEN, sender.publicKey, tokenMint.publicKey)
    );
    assert.equal(
      withdraw_info.amount.toString(),
      (Number(secondStreamedAmount) + Number(firstStreamedAmount)).toString()
    );
  });
  it("Pause Stream Token", async () => {
    await airdropDelay(5300);
    const tx = await zebecProgram.rpc.pauseResumeTokenStream({
      accounts: {
        sender: sender.publicKey,
        receiver: receiver.publicKey,
        dataAccount: firstDataAccount.publicKey,
        mint: tokenMint.publicKey,
      },
      signers: [sender],
      instructions: [],
    });

    console.log("Your transaction for pause token stream signature", tx);
    const data_account = await zebecProgram.account.streamToken.fetch(
      firstDataAccount.publicKey
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
        dataAccount: firstDataAccount.publicKey,
        mint: tokenMint.publicKey,
      },
      signers: [sender],
      instructions: [],
    });

    console.log("Your transaction for pause token stream signature", tx);
    const data_account = await zebecProgram.account.streamToken.fetch(
      firstDataAccount.publicKey
    );
    assert.equal(data_account.paused.toString(), "0");
    resumedAt = await getTxTime(tx, provider);
  });
  it("Withdraw First Token Stream", async () => {
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
    const tx = await zebecProgram.rpc.withdrawTokenStream({
      accounts: {
        destAccount: receiver.publicKey,
        sourceAccount: sender.publicKey,
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        zebecVault: await zebecVault(sender.publicKey),
        dataAccount: firstDataAccount.publicKey,
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
      firstDataAccount.publicKey
    );
    if (paused == "1") {
      let withdrawAmount = data_account.withdrawn.toString();
      let totalStreamedAmount = data_account.amount.toString();
      console.log(
        "case 1==> its paused and resume and withdraw time is less than end time",
        withDrawTime < firstEndTime
      );
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
      let diffBetweenStartAndWithdrawTime = withDrawTime - firstStartTime;
      let diffBetweenStartAndEndTime = firstEndTime - firstStartTime;
      let perSecondAmount = totalStreamedAmount / diffBetweenStartAndEndTime;
      let totalSpendTime =
        diffBetweenStartAndWithdrawTime - diffBetweenResumeAndPauseTime;
      let expectedWithdrawAmount = parseInt(
        (perSecondAmount * totalSpendTime).toString()
      );
      let zebecFee = (expectedWithdrawAmount / 100) * 0.25;
      let expectedZebecVaultBalance =
        zebecVaultBalanceBeforeWithdraw - expectedWithdrawAmount;
      let expectedReceiverBalance = Math.ceil(
        receiverBalanceBeforeWithdraw + expectedWithdrawAmount - zebecFee
      );
      assert.equal(withdrawAmount, expectedWithdrawAmount);
      assert.equal(receiverBalanceAfterWithdraw, expectedReceiverBalance);
      assert.equal(zebecVaultBalanceAfterWithdraw, expectedZebecVaultBalance);
    }
  });
  it("Withdraw Second Token Stream", async () => {
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
      secondReceiver.publicKey,
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
      secondReceiver.publicKey,
      provider
    );
    let zebecVaultBalanceBeforeWithdraw = await getBalanceOfSplToken(
      tokenMint.publicKey,
      zebecVaultAddress,
      provider
    );
    const tx = await zebecProgram.rpc.withdrawTokenStream({
      accounts: {
        destAccount: secondReceiver.publicKey,
        sourceAccount: sender.publicKey,
        feeOwner: fee_receiver.publicKey,
        feeVaultData: await create_fee_account(fee_receiver.publicKey),
        feeVault: await feeVault(fee_receiver.publicKey),
        zebecVault: await zebecVault(sender.publicKey),
        dataAccount: secondDataAccount.publicKey,
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
      signers: [secondReceiver],
    });
    console.log("Your signature for withdraw token stream is ", tx);
    let withDrawTime = await getTxTime(tx, provider);
    const data_account = await zebecProgram.account.streamToken.fetch(
      secondDataAccount.publicKey
    );
    if (paused == "1") {
      let withdrawAmount = data_account.withdrawn.toString();
      let totalStreamedAmount = data_account.amount.toString();
      console.log(
        "case 1==> its paused and resume and withdraw time is less than end time",
        withDrawTime < firstEndTime
      );
      let receiverBalanceAfterWithdraw = await getBalanceOfSplToken(
        tokenMint.publicKey,
        secondReceiver.publicKey,
        provider
      );
      let zebecVaultBalanceAfterWithdraw = await getBalanceOfSplToken(
        tokenMint.publicKey,
        zebecVaultAddress,
        provider
      );
      let diffBetweenStartAndWithdrawTime = withDrawTime - secondStartTime;
      let diffBetweenStartAndEndTime = secondEndTime - secondStartTime;
      let perSecondAmount = totalStreamedAmount / diffBetweenStartAndEndTime;
      let totalSpendTime = diffBetweenStartAndWithdrawTime;
      let expectedWithdrawAmount = parseInt(
        (perSecondAmount * totalSpendTime).toString()
      );
      let zebecFee = (expectedWithdrawAmount / 100) * 0.25;
      let expectedZebecVaultBalance =
        zebecVaultBalanceBeforeWithdraw - expectedWithdrawAmount;
      let expectedReceiverBalance = Math.ceil(
        receiverBalanceBeforeWithdraw + expectedWithdrawAmount - zebecFee
      );
      assert.equal(withdrawAmount, expectedWithdrawAmount);
      assert.equal(receiverBalanceAfterWithdraw, expectedReceiverBalance);
      assert.equal(zebecVaultBalanceAfterWithdraw, expectedZebecVaultBalance);
    }
  });
});

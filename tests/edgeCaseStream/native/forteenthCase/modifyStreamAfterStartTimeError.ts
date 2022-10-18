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
import { getClusterTime } from "../../../src/utils";
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

describe("zebec native modifyStreamAfterStartTimeError", () => {
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
    startTime = new anchor.BN(now + 7);
    endTime = new anchor.BN(now + 22);
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

  it("Update Stream", async () => {
    let now = await getClusterTime(provider.connection);
    let updatedStartTime = new anchor.BN(now - 20);
    let updatedEndTime = new anchor.BN(now + 10);
    let differenceBetweenStartAndCurrentTime = startTime - now + 1;
    await airdropDelay(differenceBetweenStartAndCurrentTime * 1000);
    const amount = new anchor.BN(anchor.web3.LAMPORTS_PER_SOL);
    try {
      const tx = await zebecProgram.rpc.nativeStreamUpdate(
        updatedStartTime,
        updatedEndTime,
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
    } catch (err) {
      console.log("error", err.message);
      assert.equal(err.message.split(": ")[1], "StreamAlreadyStarted");
    }
  });
});

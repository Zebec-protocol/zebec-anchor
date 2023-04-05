import { describe } from 'mocha';

import * as anchor from '@project-serum/anchor';
import {
  BN,
  web3,
} from '@project-serum/anchor';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

import {
  batchTransferProgram,
  multisigProgram,
} from './src/Constants';
import {
  getTxSize,
  solFromProvider,
  tokenFromProvider,
} from './src/utils';

const provider = anchor.Provider.env();
anchor.setProvider(provider);   

describe("bulk transfer flow test", () => {
    const multisig = web3.Keypair.generate();
    const ownerA = web3.Keypair.generate();
    const ownerB = web3.Keypair.generate();
    const ownerC = web3.Keypair.generate();
    const owners = [ownerA.publicKey, ownerB.publicKey, ownerC.publicKey];
    
    const multisigSize = 8 + 8 + 32 * owners.length + 8 + 1 + 4;
    const threshold = new BN(2);

    const receiver = anchor.web3.Keypair.generate();
    const fee_receiver = new anchor.web3.Keypair();

    it("creates multisig", async () => {
        const [,nonce] = await web3.PublicKey.findProgramAddress(
            [multisig.publicKey.toBuffer()],
            multisigProgram.programId
          );
          
         await multisigProgram.rpc.createMultisig(owners, threshold, nonce, {
            accounts: {
                multisig: multisig.publicKey
            },
            instructions: [await multisigProgram.account.multisig.createInstruction(multisig, multisigSize)],
            signers: [multisig]
         });
    });

    it("Airdrop Solana", async () => {
        const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
          [multisig.publicKey.toBuffer()],
          multisigProgram.programId
        );
        await solFromProvider(provider,ownerA.publicKey,0.2);
        // await solFromProvider(provider,fee_receiver.publicKey,0.5);
        await solFromProvider(provider,multisigSigner,0.1);
        // await solFromProvider(provider,receiver.publicKey,0.1);
        const multisigAccountInfo = await anchor.getProvider().connection.getAccountInfo(multisigSigner);
        console.log("Info :", multisigAccountInfo.owner.toBase58());
       
        const mint = new anchor.web3.PublicKey("AbLwGR8A1wvsiLWrzzA5eYPoQw51NVMcMMTPvAv5LTJ");
        await tokenFromProvider(provider, multisigSigner, mint, 1);
      });

    it("Transfer token", async () => {
        const pid = batchTransferProgram.programId;
        const mint = new anchor.web3.PublicKey("AbLwGR8A1wvsiLWrzzA5eYPoQw51NVMcMMTPvAv5LTJ");
        const publicKeys: web3.PublicKey[] = [
          new web3.PublicKey("Fx3xZ86YZw3gJUHU3FQKKq6ZDbkDLHa5j4z84gBY5LzF"),
          new web3.PublicKey("4VbwC8uYtjfj2jimQpyshaXRW2u5A3iyhUXQFTb82kCV"),
          new web3.PublicKey("H9kQHjJSUgbAABxwyFG4MXWb7vqfbBXq2nmPDFFU1S6T"),
          new web3.PublicKey("95Zp1x4f55uHBHFghX6YmKtQK16ZkqG7KZNmzyeg2ZGL"),
          new web3.PublicKey("FoqznQf9YL4kuTuRzTJbi4pCHghN32wEtqi4ZaE4bmJi"),
          new web3.PublicKey("6mcgvH3n5KWfedpzMj7aKT19VWLrkAeq5FSyLtwX2beq"),
          new web3.PublicKey("5JF1zKkoUWTGuCgRCT9caEP5a2kGB66jsGmfwsBKYsjE"),
          new web3.PublicKey("AxuiXjbNsGGRSCHgDvHFr8Y2c53jbbpXPeiWBvJmdvaX"),
          new web3.PublicKey("5QeqNRYVjJ8Apt8D44JtDHq4R3kkNX9p6sLtf2yUMvFL"),
          new web3.PublicKey("BGv5qqyi69HgR6EEYQK6wdFRj3cWsK2PvntvgJ9ECCdV"),
          // new web3.PublicKey("4xrE4NUmXEW4PwCQU25AmLQmCBNagmWF8ehT5Qoyjrwk"),
          // new web3.PublicKey("DMGY4uF97WRGohaJLKHH7ndSwKTqsZLxZLwusitgpHue"),
          // new web3.PublicKey("H8dgDYpJWpHBauKfR1mpw6GybEVaUmPhy4phNbvLRpgA"),
          // new web3.PublicKey("6q3CLKPQZECGA9QRHNdYmr796Cn8bYCgK9eHD63T6eeb"),
          // new web3.PublicKey("8XoCkZz1WM7ndkbQX8fVXaGYyJobroUs2o2of8m5S8HU"),
          // new web3.PublicKey("Gp2dJNgoqm8zqFHrgV5AZiGp3sRebdAqmP9werpzjMxF"),
          // new web3.PublicKey("5E6homPXerHHTPRwRn22L2u8qkGaXQHMj4v5d9vSMvui"),
          // new web3.PublicKey("5XBesCRdQKqJJor2MawQZf45fegUbNkD4nFxSUpZhnnA"),
          // new web3.PublicKey("5XRQpwDLdQAa14U2W6aCAZxHvQxqRRdcGMvH7xEkUiK4"),
          // new web3.PublicKey("3N1aEZQ5kontZwXXvYHt2PitNo283rfQn3D5F5tnAB7x"),
          // new web3.PublicKey("GqJjf4joy9tBtjKWoFJ4B3Qz8ebGvf5XcWeKJ3SaTvDb"),
          // new web3.PublicKey("3BYwYKd49HPh5EQDciPwWampjtL8cLNKMQrZh8QwKKyF")
        ];
        const pubkeysTokenAccounts: web3.PublicKey[] = [];
        for (let i = 0; i < publicKeys.length; i++) {
          pubkeysTokenAccounts.push(await getAssociatedTokenAddress(mint, publicKeys[i], true))
        }
        const amounts: BN[] = [];
        for (let i = 0; i < publicKeys.length; i++) {
            amounts.push(new BN(100000))
        }
          const [multisigSigner, _] = await anchor.web3.PublicKey.findProgramAddress(
            [multisig.publicKey.toBuffer()],
            multisigProgram.programId
          );
          const multisigSignerTokenAccounts = await getAssociatedTokenAddress(mint, multisigSigner,true);
          console.log("multisig:", multisig.publicKey.toString(), "multisigSigner", multisigSigner.toString())

      
          const accounts: web3.AccountMeta[] = [];
          accounts.push({
            pubkey: multisigSigner,
            isSigner: true,
            isWritable: true,
          },
          {
            pubkey: multisigSignerTokenAccounts,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey:mint,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: web3.SystemProgram.programId,
            isSigner: false,
            isWritable: false,
          });
          for (const account of pubkeysTokenAccounts) {
            accounts.push({
              pubkey: account,
              isSigner: false,
              isWritable: true,
            });
          }
      
          accounts.push({
            pubkey: multisigSigner,
            isSigner: true,
            isWritable: true,
          }, 
          {
            pubkey: multisigSignerTokenAccounts,
            isSigner: false,
            isWritable: true,
          },
          {
            pubkey: mint,
            isSigner: false,
            isWritable: false,
          },
          {
            pubkey: TOKEN_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
          });
          // request air drop for all accounts
          // for (const account of publicKeys) {
          //   getProvider().connection.requestAirdrop(account, 1000);
          // }
      
          
          const transaction = anchor.web3.Keypair.generate();

          const data = batchTransferProgram.coder.instruction.encode("batchSolTransfer", {
            amount: amounts
          })
          const txSize = getTxSize(accounts, owners, true, 8 * amounts.length);
          console.log("Accounts length: ", amounts.length);
          console.log("txSize: ", txSize);
          
          try{
          const createTransactionSignature = await multisigProgram.rpc.createTransaction(
            pid, 
            accounts, 
            data, 
            {
              accounts: {
                multisig: multisig.publicKey,
                proposer: ownerA.publicKey,
                transaction: transaction.publicKey
            },
            instructions: [
                await multisigProgram.account.transaction.createInstruction(
                  transaction,
                  txSize
                ),
              ],
              signers: [transaction, ownerA],
        });

        
        console.log("sig :", createTransactionSignature);
        const approveTx = await multisigProgram.rpc.approve({
          accounts: {
            multisig: multisig.publicKey,
            transaction: transaction.publicKey,
            owner: ownerB.publicKey,
          },
          signers: [ownerB],
        });
        console.log(
          "Multisig Deposit SOl Transaction Approved by ownerB",
          approveTx
        );

        const remainingAccounts = accounts
        .map((t) => {
          if (t.pubkey.equals(multisigSigner)) {
            return { ...t, isSigner: false };
          }
          return t;
        })
        .concat({
          pubkey: batchTransferProgram.programId,
          isWritable: false,
          isSigner: false,
        });
        
        const execSig = await multisigProgram.rpc.executeTransaction({
          accounts: {
            multisig: multisig.publicKey,
            multisigSigner,
            transaction: transaction.publicKey,
          },
          remainingAccounts
        });
        console.log("exec Sig: ", execSig);
      }
      catch(e){
        console.log(e);
      }
    })
});
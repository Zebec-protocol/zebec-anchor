import * as anchor from '@project-serum/anchor';
const assert = require("assert");

describe("multisig", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.getProvider());

  // const program = anchor.workspace.SerumMultisig;
  const programId = new anchor.web3.PublicKey("GbepLUYxQG4dcjRqXGyuc98nnDQoTxah1Rm2tBWRdh5j");
  const idl = JSON.parse(
    require("fs").readFileSync("./target/idl/serum_multisig.json", "utf8")
  );
  const program = new anchor.Program(idl, programId);
  const zebecprogramId = new anchor.web3.PublicKey("3svmYpJGih9yxkgqpExNdQZLKQ7Wu5SEjaVUbmbytUJg");
  const zebecidl = JSON.parse(
    require("fs").readFileSync("./target/idl/zebec.json", "utf8")
  );
  const zebecprogram = new anchor.Program(zebecidl, zebecprogramId);
  const ownerA = anchor.web3.Keypair.generate();
  const ownerB = anchor.web3.Keypair.generate();
  const ownerC = anchor.web3.Keypair.generate();
  const ownerD = anchor.web3.Keypair.generate();
  const owners = [ownerA.publicKey, ownerB.publicKey, ownerC.publicKey];
  const multisig = anchor.web3.Keypair.generate();
  const transaction = anchor.web3.Keypair.generate();



  const sender = anchor.web3.Keypair.generate();
  let dataAccount = anchor.web3.Keypair.generate();
  const receiver = anchor.web3.Keypair.generate();
  const PREFIX = "withdraw_sol";

  console.log("Sender key: "+sender.publicKey.toBase58());
  console.log("Receiver key: "+receiver.publicKey.toBase58());
  console.log("Pda key: "+dataAccount.publicKey.toBase58());

  it("Tests the multisig program", async () => {
    const [multisigSigner, nonce] =
      await anchor.web3.PublicKey.findProgramAddress(
        [multisig.publicKey.toBuffer()],
        program.programId
      );
    const multisigSize = 200; // Big enough.


        
    const threshold = new anchor.BN(2);
    const tx = await program.rpc.createMultisig(owners, threshold, nonce, {
      accounts: {
        multisig: multisig.publicKey,
      },
      instructions: [
        await program.account.multisig.createInstruction(
          multisig,
          multisigSize
        ),
      ],
      signers: [multisig],
    });
    console.log("Your transaction signature", tx);
  })

  it("Creating txn", async () => {
    const [multisigSigner, nonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      program.programId
    );
    const [withdraw_data, _]= await anchor.web3.PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode(PREFIX),multisigSigner.toBuffer()], program.programId
    )
    const pid = new anchor.web3.PublicKey("3svmYpJGih9yxkgqpExNdQZLKQ7Wu5SEjaVUbmbytUJg");
    let now = Math.floor(new Date().getTime() / 1000)
    const startTime = new anchor.BN(now-1000) 
    const paused = new anchor.BN(now) 
    const endTime=new anchor.BN(now+3600)
    // console.log(anchor.web3.SystemProgram)
    const amount=new anchor.BN(1000)
    const accounts =[
    {
      pubkey:dataAccount.publicKey,
      isWritable: true,
      isSigner: false},
    {
      pubkey: withdraw_data,
      isWritable: true,
      isSigner: false},
    // {
    //   pubkey: new anchor.web3.PublicKey("11111111111111111111111111111111"),
    //   isWritable: true,
    //   isSigner: false
    // },
    {
      pubkey: multisigSigner,
      isWritable: false,
      isSigner: true},
    {
      pubkey:receiver.publicKey,
      isWritable: true,
      isSigner: false
    }
      ]
    const newOwners = [ownerA.publicKey, ownerB.publicKey, ownerD.publicKey];
    const pdata = [startTime,endTime,amount]
    const data = zebecprogram.coder.instruction.encode("nativeStream",pdata);
    const txSize = 1000; // Big enough, cuz I'm lazy.

    const tx = await program.rpc.createTransaction(pid, accounts,data,{
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        proposer: ownerA.publicKey,
      },
      instructions: [
        await program.account.transaction.createInstruction(
          transaction,
          txSize
        ),
      ],
      signers: [transaction, ownerA],
    });
    console.log("Your transaction signature", tx);
    const txAccount = await program.account.transaction.fetch(
      transaction.publicKey
    );
    console.log(txAccount)
  })
  it("Approving txn", async () => {
    await program.rpc.approve({
      accounts: {
        multisig: multisig.publicKey,
        transaction: transaction.publicKey,
        owner: ownerB.publicKey,
      },
      signers: [ownerB],
    });
  })
    it("Approving txn", async () => {
      const [multisigSigner, nonce] =
    await anchor.web3.PublicKey.findProgramAddress(
      [multisig.publicKey.toBuffer()],
      program.programId
    );
    const [withdraw_data, _]= await anchor.web3.PublicKey.findProgramAddress([
      anchor.utils.bytes.utf8.encode(PREFIX),multisigSigner.toBuffer()], program.programId
    )
    const accounts =[
      {
        pubkey:dataAccount.publicKey,
        isWritable: true,
        isSigner: false},
      {
        pubkey: withdraw_data,
        isWritable: true,
        isSigner: false},
      // {
      //   pubkey: new anchor.web3.PublicKey("11111111111111111111111111111111"),
      //   isWritable: true,
      //   isSigner: false
      // },
      {
        pubkey: multisigSigner,
        isWritable: false,
        isSigner: true},
      {
        pubkey:receiver.publicKey,
        isWritable: true,
        isSigner: false
      }
        ]
      await program.rpc.executeTransaction({
        accounts: {
          multisig: multisig.publicKey,
          multisigSigner,
          transaction: transaction.publicKey,
        },
        // remainingAccounts: zebecprogram.instruction.nativeStream
        //   .accounts({
        //     multisig: multisig.publicKey,
        //     multisigSigner,
        //   })
          // Change the signer status on the vendor signer since it's signed by the program, not the client.
          // .map((meta) =>
          //   meta.pubkey.equals(multisigSigner)
          //     ? { ...meta, isSigner: false }
          //     : meta
          // )
          // .concat({
          //   pubkey: program.programId,
          //   isWritable: false,
          //   isSigner: false,
          // }),
      });
  
    })
});
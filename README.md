Zebec is a revolutionary DeFi technology that empowers real-time, frictionless and continuous streams of payments. The automatic money streams made possible through Zebec allow businesses, employees and consumers to completely reimagine how they are paid, how they invest and how they buy products or services.The program uses https://github.com/coral-xyz/multisig which provides Grant of Copyright License. We want to thank all the contributors of coral-xyz/multisig

# Cloning the repository
``` git clone https://github.com/Zebec-protocol/zebec-anchor.git ```
# Build 
``` anchor build ```
# ProgramIDs
```solana address -k $(pwd)/target/deploy/zebec-keypair.json ```
<br />

```solana address -k  $(pwd)/target/deploy/serum_multisig-keypair.json ```
# Update program Id
Update the program ids inside **Anchor.toml**,**programs/zebec/src/lib.rs**&**programs/multisig/src/lib.rs**
<br />

Update the program ids inside **tests/src/Constants.ts**
# Install dependencies
``` npm install ```
# Run test
``` anchor test ```


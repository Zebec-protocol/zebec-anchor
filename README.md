Zebec is a revolutionary DeFi technology that empowers real-time, frictionless and continuous streams of payments. The automatic money streams made possible through Zebec allow businesses, employees and consumers to completely reimagine how they are paid, how they invest and how they buy products or services.

# Cloning the repository
``` git clone https://github.com/Zebec-protocol/zebec-anchor.git ```

# Build 
``` anchor build ```
# Deploy
```solana program deploy $(pwd)/target/deploy/zebec.so ```

# Update program Id

Once you deploy your program, update the program id inside **Anchor.toml** and **programs/zebec/src/lib.rs**

# Run test

anchor test


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


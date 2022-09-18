import { clusterApiUrl, Connection,PublicKey } from "@solana/web3.js";
import { zebecProgram } from "./src/Constants";
const programId = new PublicKey(
    "zbcKGdAmXfthXY3rEPBzexVByT2cqRqCZb9NwWdGQ2T"
  );
  (async () => {
    const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
    //To Find all the zebec vaults
    const accounts = await connection.getProgramAccounts(
        programId,
      {
        filters: [
          {
            dataSize: 0, // number of bytes
          },
        ],
      }
    );
    console.log(accounts);
//Find token accounts and corresponding token balances of these vaults to get the total TVL
})();
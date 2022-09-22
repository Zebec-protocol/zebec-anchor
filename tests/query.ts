import { clusterApiUrl, Connection,PublicKey } from "@solana/web3.js";
import {
 programId
} from "./src/Constants";
let wallet_address="J75jd3kjsABQSDrEdywcyhmbq8eHDowfW9xtEWsVALy9";
let receiver_walletAddress="dZSDtwhoN6gWodDipcwLCsYS7EmUxQjd9ijd6xtMm6B";

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
    console.log("The vault Accounts are",accounts);
//Find token accounts and corresponding token balances of these vaults to get the total TVL
const datAccounts = await connection.getProgramAccounts(
  programId,
{
  filters: [
    {
      dataSize: 178, // number of bytes of STREAM
    },
    {
      memcmp: {
        offset: 48, // number of bytes
        bytes: wallet_address, // base58 encoded string
      },},
      {
        memcmp: {
          offset: 80, // number of bytes
          bytes: receiver_walletAddress, // base58 encoded string
        },}
  ],
}
);
console.log("The stream data Accounts pubKey are:");
datAccounts.forEach((item) => {
console.log(item.pubkey.toBase58());
});
})();
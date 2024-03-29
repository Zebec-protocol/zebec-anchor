import { PublicKey } from "@solana/web3.js";
import * as anchor from "@project-serum/anchor";

const provider = anchor.Provider.env();
anchor.setProvider(provider);
export const programId = new anchor.web3.PublicKey(
  "zbcKGdAmXfthXY3rEPBzexVByT2cqRqCZb9NwWdGQ2T"
);
export const multisigProgramId = new anchor.web3.PublicKey(
  "b6ZPysThkApNx2YDiGsPUiYPE7Ub1kTRdCWp7gBkzbr"
);
const idl = JSON.parse(
  require("fs").readFileSync("./target/idl/zebec.json", "utf8")
);
const multisigIdl = JSON.parse(
  require("fs").readFileSync("./target/idl/serum_multisig.json", "utf8")
);
export const zebecProgram = new anchor.Program(idl, programId);
export const multisigProgram = new anchor.Program(
  multisigIdl,
  multisigProgramId
);
export const PREFIX = "withdraw_sol";
export const OPERATE = "NewVaultOption";
export const OPERATEDATA = "NewVaultOptionData";

export const PREFIX_TOKEN = "withdraw_token";
export const STREAM_TOKEN_SIZE =
  8 + 8 + 8 + 8 + 8 + 8 + 32 + 32 + 32 + 8 + 8 + 32 +8+ 8 + 1 + 1;
// discriminator: 8 byter+start_time: u64+end_time: u64+paused: u64+withdraw_limit: u64+amount: u64,sender:Pubkey+receiver: Pubkey+token_mint: Pubkey+withdrawn: u64+paused_at: u64+fee_owner:Pubkey+fee_percentage+paused_amt:u64+can_cancel:bool+can_update:bool,
export const STREAM_SIZE =
  8 + 8 + 8 + 8 + 8 + 8 + 32 + 32 + 8 + 8 + 32 + 8+ 8 + 1 + 1;
// discriminator: 8 byter+start_time: u64+end_time: u64+paused: u64+withdraw_limit: u64+amount: u64,sender:Pubkey+receiver: Pubkey+withdrawn: u64+paused_at: u64+fee_owner:Pubkey+fee_percentage:u64+paused_amt:u64+can_cancel:bool+can_update:bool,can_update:cancel

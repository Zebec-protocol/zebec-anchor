import { PublicKey } from "@solana/web3.js";
import * as anchor from '@project-serum/anchor';

const provider = anchor.Provider.env();
anchor.setProvider(provider)
const programId = new anchor.web3.PublicKey("14NJEfpvoq6PywHdwFhXcfnHTsPUK3cScCaezKBSDWLd");
const idl = JSON.parse(
  require("fs").readFileSync("./target/idl/zebec.json", "utf8")
);
const program = new anchor.Program(idl, programId);

export const PREFIX = "withdraw_sol"
export const OPERATE="NewVaultOption";
export const OPERATEDATA="NewVaultOptionData";
export const programZebec = new PublicKey("14NJEfpvoq6PywHdwFhXcfnHTsPUK3cScCaezKBSDWLd");
export const PREFIX_TOKEN= "withdraw_token"

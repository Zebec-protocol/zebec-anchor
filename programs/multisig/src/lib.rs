//! An example of a multisig to execute arbitrary Solana transactions.
//!
//! This program can be used to allow a multisig to govern anything a regular
//! Pubkey can govern. One can use the multisig as a BPF program upgrade
//! authority, a mint authority, etc.
//!
//! To use, one must first create a `Multisig` account, specifying two important
//! parameters:
//!
//! 1. Owners - the set of addresses that sign transactions for the multisig.
//! 2. Threshold - the number of signers required to execute a transaction.
//!
//! Once the `Multisig` account is created, one can create a `Transaction`
//! account, specifying the parameters for a normal solana transaction.
//!
//! To sign, owners should invoke the `approve` instruction, and finally,
//! the `execute_transaction`, once enough (i.e. `threshold`) of the owners have
//! signed.

use anchor_lang::prelude::*;
use anchor_lang::solana_program;
use anchor_lang::solana_program::instruction::Instruction;
use std::convert::Into;
use std::ops::Deref;

declare_id!("b6ZPysThkApNx2YDiGsPUiYPE7Ub1kTRdCWp7gBkzbr");

#[program]
pub mod serum_multisig {
    use super::*;
    // Initializes a new multisig account with a set of owners and a threshold.
    pub fn create_multisig(
        ctx: Context<CreateMultisig>,
        owners: Vec<Pubkey>,
        threshold: u64,
        nonce: u8,
    ) -> Result<()> {
        assert_unique_owners(&owners)?;
        require!(
            threshold > 0 && threshold <= owners.len() as u64,
            InvalidThreshold
        );
        require!(!owners.is_empty(), InvalidOwnersLen);

        let multisig = &mut ctx.accounts.multisig;
        multisig.owners = owners;//vector of publickey
        multisig.threshold = threshold;//8
        multisig.nonce = nonce;//1
        multisig.owner_set_seqno = 0;//4
        Ok(())
    }
    // Creates a new transaction account, automatically signed by the creator,
    // which must be one of the owners of the multisig.
    pub fn create_transaction(
        ctx: Context<CreateTransaction>,
        pid: Pubkey,
        accs: Vec<TransactionAccount>,
        data: Vec<u8>,
    ) -> Result<()> {
        let owner_index = ctx
            .accounts
            .multisig
            .owners
            .iter()
            .position(|a| a == ctx.accounts.proposer.key)
            .ok_or(ErrorCode::InvalidOwner)?;

        let mut signers = Vec::new();
        signers.resize(ctx.accounts.multisig.owners.len(), false);
        signers[owner_index] = true;

        let tx = &mut ctx.accounts.transaction;
        tx.program_id = pid;
        tx.accounts = accs;
        tx.data = data;
        tx.signers = signers;
        tx.multisig = ctx.accounts.multisig.key();
        tx.did_execute = false;
        tx.owner_set_seqno = ctx.accounts.multisig.owner_set_seqno;
        tx.approved.push(ctx.accounts.proposer.key());
        tx.pending()?;
        Ok(())
    }
    // Approves a transaction on behalf of an owner of the multisig.
    pub fn approve(ctx: Context<Approve>)
     -> Result<()> {
        if ctx.accounts.transaction.status == TransactionStatus::Cancelled
        {
            return Err(ErrorCode::AlreadyCancelled.into());
        }
        if ctx.accounts.transaction.status == TransactionStatus::Executed {
            return Err(ErrorCode::AlreadyExecuted.into());
        }
        let owner_index = ctx
            .accounts
            .multisig
            .owners
            .iter()
            .position(|a| a == ctx.accounts.owner.key)
            .ok_or(ErrorCode::InvalidOwner)?;
        
        if ctx
        .accounts
        .transaction
        .rejected
        .iter()
        .any(|a| a == ctx.accounts.owner.key)
        {
            return Err(ErrorCode::AlreadyRejected.into());
        }
        if ctx.accounts.transaction.signers[owner_index]==true
        {        
            return Err(ErrorCode::AlreadyApproved.into());
        }
        ctx.accounts.transaction.signers[owner_index] = true;
        ctx.accounts.transaction.approved.push(ctx.accounts.owner.key());
        Ok(())
    }
    pub fn reject(ctx: Context<Reject>)
    -> Result<()> {
        if ctx.accounts.transaction.status == TransactionStatus::Cancelled
        {
            return Err(ErrorCode::AlreadyCancelled.into());
        }
       let owner_index = ctx
           .accounts
           .multisig
           .owners
           .iter()
           .position(|a| a == ctx.accounts.owner.key)
           .ok_or(ErrorCode::InvalidOwner)?;
        if ctx
            .accounts
            .transaction
            .rejected
            .iter()
            .any(|a| a == ctx.accounts.owner.key)
        {
            return Err(ErrorCode::AlreadyRejected.into());
        }
       if ctx.accounts.transaction.signers[owner_index]==true
       {        
           return Err(ErrorCode::AlreadyApproved.into());
       }
       ctx.accounts.transaction.rejected.push(ctx.accounts.owner.key());
       //owners=7
       //threshold=4
       //cancel case is when it can't reach the threshold signers i.e > owners-threshold
       let cancelcutoff = ctx.accounts.multisig.owners.len().checked_sub(ctx.accounts.multisig.threshold as usize).unwrap();
       if ctx.accounts.transaction.rejected.len() > cancelcutoff {
           ctx.accounts.transaction.cancelled()?;
       }
       Ok(())
   }
    // Set owners and threshold at once.
    pub fn set_owners_and_change_threshold<'info>(
        ctx: Context<'_, '_, '_, 'info, Auth<'info>>,
        owners: Vec<Pubkey>,
        threshold: u64,
    ) -> Result<()> 
    {
        set_owners(
            Context::new(
                ctx.program_id,
                ctx.accounts,
                ctx.remaining_accounts,
                ctx.bumps.clone(),
            ),
            owners,
        )?;
        change_threshold(ctx, threshold)
    }
    // Sets the owners field on the multisig. The only way this can be invoked
    // is via a recursive call from execute_transaction -> set_owners.
    pub fn set_owners(ctx: Context<Auth>, owners: Vec<Pubkey>) -> Result<()> 
    {
        assert_unique_owners(&owners)?;
        require!(!owners.is_empty(), InvalidOwnersLen);

        let multisig = &mut ctx.accounts.multisig;

        if (owners.len() as u64) < multisig.threshold {
            multisig.threshold = owners.len() as u64;
        }

        multisig.owners = owners;
        multisig.owner_set_seqno += 1;

        Ok(())
    }
    // Changes the execution threshold of the multisig. The only way this can be
    // invoked is via a recursive call from execute_transaction ->
    // change_threshold.
    pub fn change_threshold(ctx: Context<Auth>, threshold: u64) -> Result<()> 
    {
        require!(threshold > 0, InvalidThreshold);
        if threshold > ctx.accounts.multisig.owners.len() as u64 {
            return Err(ErrorCode::InvalidThreshold.into());
        }
        let multisig = &mut ctx.accounts.multisig;
        multisig.threshold = threshold;
        Ok(())
    }
    // Executes the given transaction if threshold owners have signed it.
    pub fn execute_transaction(ctx: Context<ExecuteTransaction>) -> Result<()>
    {
        // Has this been executed already?
        if ctx.accounts.transaction.did_execute {
            return Err(ErrorCode::AlreadyExecuted.into());
        }
        if ctx.accounts.transaction.status == TransactionStatus::Cancelled
        {
            return Err(ErrorCode::AlreadyCancelled.into());
        }
        if ctx.accounts.transaction.status == TransactionStatus::Executed 
        {
            return Err(ErrorCode::AlreadyExecuted.into());
        }
        // Do we have enough signers.
        let sig_count = ctx
            .accounts
            .transaction
            .signers
            .iter()
            .filter(|&did_sign| *did_sign)
            .count() as u64;
        if sig_count < ctx.accounts.multisig.threshold {
            return Err(ErrorCode::NotEnoughSigners.into());
        }

        // Execute the transaction signed by the multisig.
        let mut ix: Instruction = (*ctx.accounts.transaction).deref().into();
        ix.accounts = ix
            .accounts
            .iter()
            .map(|acc| {
                let mut acc = acc.clone();
                if &acc.pubkey == ctx.accounts.multisig_signer.key {
                    acc.is_signer = true;
                }
                acc
            })
            .collect();
        let multisig_key = ctx.accounts.multisig.key();
        let seeds = &[multisig_key.as_ref(), &[ctx.accounts.multisig.nonce]];
        let signer = &[&seeds[..]];
        let accounts = ctx.remaining_accounts;
        solana_program::program::invoke_signed(&ix, accounts, signer)?;

        // Burn the transaction to ensure one time use.
        ctx.accounts.transaction.did_execute = true;
        ctx.accounts.transaction.executed()?;
        Ok(())
    }
}
#[derive(Accounts)]
pub struct CreateMultisig<'info> 
{
    #[account(zero, signer)]
    multisig: Box<Account<'info, Multisig>>,
}
#[derive(Accounts)]
pub struct CreateTransaction<'info> 
{
    multisig: Box<Account<'info, Multisig>>,
    #[account(zero, signer)]
    transaction: Box<Account<'info, Transaction>>,
    // One of the owners. Checked in the handler.
    proposer: Signer<'info>,
}
#[derive(Accounts)]
pub struct Approve<'info>
{
    #[account(constraint = multisig.owner_set_seqno == transaction.owner_set_seqno)]
    multisig: Box<Account<'info, Multisig>>,
    #[account(mut, has_one = multisig)]
    transaction: Box<Account<'info, Transaction>>,
    // One of the multisig owners. Checked in the handler.
    owner: Signer<'info>,
}
#[derive(Accounts)]
pub struct Reject<'info>
{    
    #[account(constraint = multisig.owner_set_seqno == transaction.owner_set_seqno)]
    multisig: Box<Account<'info, Multisig>>,
    #[account(mut, has_one = multisig)]
    transaction: Box<Account<'info, Transaction>>,
    // One of the multisig owners. Checked in the handler.
    owner: Signer<'info>,
}
#[derive(Accounts)]
pub struct Auth<'info>
{
    #[account(mut)]
    multisig: Box<Account<'info, Multisig>>,
    #[account(
        seeds = [multisig.key().as_ref()],
        bump = multisig.nonce,
    )]
    multisig_signer: Signer<'info>,
}
#[derive(Accounts)]
pub struct ExecuteTransaction<'info> 
{
    #[account(constraint = multisig.owner_set_seqno == transaction.owner_set_seqno)]
    multisig: Box<Account<'info, Multisig>>,
    /// CHECK: multisig_signer is a PDA program signer. Data is never read or written to
    #[account(
        seeds = [multisig.key().as_ref()],
        bump = multisig.nonce,
    )]
    multisig_signer: UncheckedAccount<'info>,
    #[account(mut, has_one = multisig)]
    transaction: Box<Account<'info, Transaction>>,
}
#[account]
pub struct Multisig 
{
    pub owners: Vec<Pubkey>,
    pub threshold: u64,
    pub nonce: u8,
    pub owner_set_seqno: u32,
}
#[account]
pub struct Transaction {
    // The multisig account this transaction belongs to.
    pub multisig: Pubkey,
    // Target program to execute against.
    pub program_id: Pubkey,
    // Accounts requried for the transaction.
    pub accounts: Vec<TransactionAccount>,
    // Instruction data for the transaction.
    pub data: Vec<u8>,
    // signers[index] is true iff multisig.owners[index] signed the transaction.
    pub signers: Vec<bool>,
    // Boolean ensuring one time execution.
    pub did_execute: bool,
    // Owner set sequence number.
    pub owner_set_seqno: u32,
    // owners that have approved
    pub approved: Vec<Pubkey>,   
    // owners that have rejected       
    pub rejected: Vec<Pubkey>,    
    //transaction status
    pub status: TransactionStatus,      
}
impl Transaction
{
    pub fn pending(&mut self) -> Result<()>{
        self.status = TransactionStatus::Pending;
        Ok(())
    }
    pub fn executed(&mut self) -> Result<()>{
        self.status = TransactionStatus::Executed;
        Ok(())
    }
    pub fn cancelled(&mut self) -> Result<()>{
        self.status = TransactionStatus::Cancelled;
        Ok(())
    }

}
impl From<&Transaction> for Instruction {
    fn from(tx: &Transaction) -> Instruction {
        Instruction {
            program_id: tx.program_id,
            accounts: tx.accounts.iter().map(Into::into).collect(),
            data: tx.data.clone(),
        }
    }
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TransactionAccount {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}
impl From<&TransactionAccount> for AccountMeta {
    fn from(account: &TransactionAccount) -> AccountMeta {
        match account.is_writable {
            false => AccountMeta::new_readonly(account.pubkey, account.is_signer),
            true => AccountMeta::new(account.pubkey, account.is_signer),
        }
    }
}

impl From<&AccountMeta> for TransactionAccount {
    fn from(account_meta: &AccountMeta) -> TransactionAccount {
        TransactionAccount {
            pubkey: account_meta.pubkey,
            is_signer: account_meta.is_signer,
            is_writable: account_meta.is_writable,
        }
    }
}

fn assert_unique_owners(owners: &[Pubkey]) -> Result<()> {
    for (i, owner) in owners.iter().enumerate() {
        require!(
            !owners.iter().skip(i + 1).any(|item| item == owner),
            UniqueOwners
        )
    }
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TransactionStatus {
    Executed,       // Transaction has been executed
    Pending,        // Transaction requires more approva;
    Cancelled,     // Transaction has been cancelled
}
#[error_code]
pub enum ErrorCode {
    #[msg("The given owner is not part of this multisig.")]
    InvalidOwner,
    #[msg("Owners length must be non zero.")]
    InvalidOwnersLen,
    #[msg("Not enough owners signed this transaction.")]
    NotEnoughSigners,
    #[msg("Cannot delete a transaction that has been signed by an owner.")]
    TransactionAlreadySigned,
    #[msg("Overflow when adding.")]
    Overflow,
    #[msg("Cannot delete a transaction the owner did not create.")]
    UnableToDelete,
    #[msg("The given transaction has already been executed.")]
    AlreadyExecuted,
    #[msg("Threshold must be less than or equal to the number of owners.")]
    InvalidThreshold,
    #[msg("Owners must be unique")]
    UniqueOwners,
    #[msg("Already Approved")]
    AlreadyApproved,
    #[msg("Already Cancelled")]
    AlreadyCancelled,
    #[msg("Already Rejected")]
    AlreadyRejected,
}

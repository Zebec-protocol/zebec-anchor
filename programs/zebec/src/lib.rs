use anchor_lang::prelude::*;
use std::convert::Into;
declare_id!("3svmYpJGih9yxkgqpExNdQZLKQ7Wu5SEjaVUbmbytUJg");

pub mod utils;
pub mod error;
use crate::{utils::{create_transfer,create_transfer_signed},error::ErrorCode};

pub const PREFIX: &str = "withdraw_sol";
pub const PREFIX_TOKEN: &str = "withdraw_token";
pub const PREFIXMULTISIG: &str = "withdraw_multisig_sol";
pub const PREFIXMULTISIGSAFE: &str = "multisig_safes";

#[program]
mod zebec {
    use super::*;
    pub fn deposit_sol(
        ctx: Context<InitializeMasterPda>,
        amount: u64
    )-> Result<()> {
        let acc = ctx.accounts.system_program.to_account_info();  
        create_transfer(ctx.accounts.sender.to_account_info(),ctx.accounts.zebec_vault.to_account_info(),acc,amount)?;
        Ok(())
    }
    
    pub fn native_stream(
        ctx: Context<Initialize>,
        start_time: u64,
        end_time: u64,
        amount: u64
    ) -> Result<()> {
        let pda = &mut ctx.accounts.pda;
        let now = Clock::get()?.unix_timestamp as u64; 
        if now >= end_time{
            return Err(ErrorCode::TimeEnd.into());
        }
        if start_time >= end_time {
            return Err(ErrorCode::InvalidInstruction.into());
        }
        pda.start_time = start_time;
        pda.end_time = end_time;
        pda.paused = 0;
        pda.amount = amount;
        pda.withdraw_limit = 0;
        pda.sender = *ctx.accounts.sender.to_account_info().key;
        pda.receiver = *ctx.accounts.receiver.to_account_info().key;
        Ok(())
    }
    pub fn withdraw_stream(
        ctx: Context<Withdraw>,
    ) -> Result<()> {
        let pda = &mut ctx.accounts.pda;
        let zebec_vault =&mut  ctx.accounts.zebec_vault;
        let system = &mut ctx.accounts.system_program.to_account_info();  
        let now = Clock::get()?.unix_timestamp as u64;
        if now <= pda.start_time {
            return Err(ErrorCode::StreamNotStarted.into());
        }
        let mut allowed_amt = pda.allowed_amt(now);
        if now >= pda.end_time {
            allowed_amt = pda.amount;
        }
        allowed_amt = allowed_amt.checked_sub(pda.withdrawn).ok_or(ErrorCode::AlreadyWithdrawnStreamingAmount)?;
        if allowed_amt > zebec_vault.lamports(){
            return Err(ErrorCode::InsufficientFunds.into());
        }
        if pda.paused == 1 && allowed_amt > pda.withdraw_limit {
                    return Err(ErrorCode::InsufficientFunds.into());
        }
        create_transfer_signed(ctx.accounts.zebec_vault.to_account_info(),ctx.accounts.receiver.to_account_info(),allowed_amt)?;
        pda.withdrawn= pda.withdrawn.checked_add(allowed_amt).ok_or(ErrorCode::NumericalOverflow)?;
        if pda.withdrawn == pda.amount { 
            create_transfer(pda.to_account_info(),ctx.accounts.sender.to_account_info(),system.to_account_info(),pda.to_account_info().lamports())?;
        }
        Ok(())
    }
    pub fn pause_stream(
        ctx: Context<Pause>,
    ) -> Result<()> {
        let pda = &mut ctx.accounts.pda;
        let now = Clock::get()?.unix_timestamp as u64;
        let allowed_amt = pda.allowed_amt(now);
        if now >= pda.end_time {
            return Err(ErrorCode::TimeEnd.into());
        }
        if now < pda.start_time{
            return Err(ErrorCode::StreamNotStarted.into());
        }

        if pda.paused ==1{
            let time_spent = now - pda.paused_at;
            let paused_start_time = pda.start_time + time_spent;
            let paused_amount = pda.allowed_amt(paused_start_time);
            let current_amount = pda.allowed_amt(now);
            let total_amount_to_sent = current_amount - paused_amount;
            pda.amount = pda.amount - total_amount_to_sent;
            pda.paused = 0;
            pda.start_time += time_spent;
            pda.end_time += time_spent;
            pda.paused_at = 0;
        }
        else{
            pda.paused = 1;
            pda.withdraw_limit = allowed_amt;
            pda.paused_at = now;
        }
        Ok(())
    }

    pub fn create_multisig(
        ctx: Context<MultisigSafe>,
        signers: Vec<Pubkey>,
        m: u64
    ) -> Result<()> {
        let pda = &mut ctx.accounts.pda;
        pda.signers = signers;
        pda.m = m;
        Ok(())
    }
}
#[derive(Accounts)]
pub struct InitializeMasterPda<'info> {
    #[account(    
        init,
        payer = sender, 
        seeds = [
            sender.key().as_ref(),
        ],bump,
        space = 0,
    )]
    /// CHECK: test
    pub zebec_vault: AccountInfo<'info>,
    #[account(mut)]
    pub sender: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer=sender,signer, space=8+8+8+8+8+32+32+8+8+200)]
    pub pda:  Account<'info, Stream>,
    #[account(
        init,
        payer=sender,
        seeds = [
            PREFIX.as_bytes(),
            sender.key().as_ref(),
        ],bump,
        space=200+1+8,
    )]
    pub withdraw_data: Account<'info, StreamedAmt>,
    #[account(mut)]
    pub sender: Signer<'info>,
     /// CHECK: test
    pub receiver: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Stream {
    pub start_time: u64,
    pub end_time: u64,
    pub amount: u64,
    pub paused: u64,
    pub withdraw_limit: u64,
    pub sender:   Pubkey,
    pub receiver: Pubkey,
    pub withdrawn: u64,
    pub paused_at: u64
}
impl Stream {
    pub fn allowed_amt(&self, now: u64) -> u64 {
        (
        ((now - self.start_time) as f64) / ((self.end_time - self.start_time) as f64) * self.amount as f64
        ) as u64 
    }
}
#[account]
pub struct StreamedAmt {
    pub amount: u64
}
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(    
        seeds = [
            sender.key().as_ref(),
        ],bump,
    )]
    /// CHECK: test
    #[account(mut)]
    pub zebec_vault: AccountInfo<'info>,
    #[account(mut)]
    /// CHECK: test
    pub sender: AccountInfo<'info>,
    #[account(mut)]
    pub receiver: Signer<'info>,
    #[account(mut,
        constraint = pda.receiver == receiver.key(),
        constraint = pda.sender == sender.key()
    )]
    pub pda:  Account<'info, Stream>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct Pause<'info> {
    pub sender: Signer<'info>,
    /// CHECK: test
    pub receiver: AccountInfo<'info>,
    #[account(mut,
        constraint = pda.receiver == receiver.key(),
        constraint = pda.sender == sender.key()
    )]
    pub pda:  Account<'info, Stream>,
}
#[derive(Accounts)]
pub struct MultisigSafe<'info> {
    #[account(
        init,
        payer=sender,
        seeds = [
            PREFIXMULTISIG.as_bytes(),
            pda.key().as_ref(),
        ],bump,
        space=200+1+8,
    )]
    /// CHECK
    pub multisig_safe: AccountInfo<'info>,
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(init, payer=sender,signer, space=32*11+8+32)]
    pub pda:  Account<'info, Multisig>,
    pub system_program: Program<'info, System>,
}
#[account]
pub struct Multisig{
    pub signers: Vec<Pubkey>,
    pub m: u64,
    pub multisig_safe: Pubkey,
}

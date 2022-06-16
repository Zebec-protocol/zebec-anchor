use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{Mint, Token, TokenAccount, Transfer}};
use std::{convert::Into,str::FromStr};
declare_id!("3svmYpJGih9yxkgqpExNdQZLKQ7Wu5SEjaVUbmbytUJg");

pub mod utils;
pub mod error;
use crate::{utils::{create_transfer,create_transfer_signed,create_transfer_token_signed},error::ErrorCode};


pub const PREFIX: &str = "withdraw_sol";
pub const PREFIX_TOKEN: &str = "withdraw_token";
pub const PREFIXMULTISIG: &str = "withdraw_multisig_sol";
pub const PREFIXMULTISIGSAFE: &str = "multisig_safe";
pub const FEERECEIVER: &str ="EsDV3m3xUZ7g8QKa1kFdbZT18nNz8ddGJRcTK84WDQ7k";
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
        let data_account = &mut ctx.accounts.data_account;
        let now = Clock::get()?.unix_timestamp as u64; 
        if now >= end_time{
            return Err(ErrorCode::TimeEnd.into());
        }
        if start_time >= end_time {
            return Err(ErrorCode::InvalidInstruction.into());
        }
        data_account.start_time = start_time;
        data_account.end_time = end_time;
        data_account.paused = 0;
        data_account.amount = amount;
        data_account.withdraw_limit = 0;
        data_account.sender = *ctx.accounts.sender.to_account_info().key;
        data_account.receiver = *ctx.accounts.receiver.to_account_info().key;
        Ok(())
    }
    pub fn withdraw_stream(
        ctx: Context<Withdraw>,
    ) -> Result<()> {
        let data_account = &mut ctx.accounts.data_account;
        let zebec_vault =&mut  ctx.accounts.zebec_vault;
        let system = &mut ctx.accounts.system_program.to_account_info();  
        let now = Clock::get()?.unix_timestamp as u64;
        if now <= data_account.start_time {
            return Err(ErrorCode::StreamNotStarted.into());
        }
        let mut allowed_amt = data_account.allowed_amt(now);
        if now >= data_account.end_time {
            allowed_amt = data_account.amount;
        }
        allowed_amt = allowed_amt.checked_sub(data_account.withdrawn).ok_or(ErrorCode::AlreadyWithdrawnStreamingAmount)?;
        if allowed_amt > zebec_vault.lamports(){
            return Err(ErrorCode::InsufficientFunds.into());
        }
        if data_account.paused == 1 && allowed_amt > data_account.withdraw_limit {
                    return Err(ErrorCode::InsufficientFunds.into());
        }
        create_transfer_signed(ctx.accounts.zebec_vault.to_account_info(),ctx.accounts.receiver.to_account_info(),allowed_amt)?;
        data_account.withdrawn= data_account.withdrawn.checked_add(allowed_amt).ok_or(ErrorCode::NumericalOverflow)?;
        if data_account.withdrawn == data_account.amount { 
            create_transfer(data_account.to_account_info(),ctx.accounts.sender.to_account_info(),system.to_account_info(),data_account.to_account_info().lamports())?;
        }
        Ok(())
    }
    pub fn pause_stream(
        ctx: Context<Pause>,
    ) -> Result<()> {
        let data_account = &mut ctx.accounts.data_account;
        let now = Clock::get()?.unix_timestamp as u64;
        let allowed_amt = data_account.allowed_amt(now);
        if now >= data_account.end_time {
            return Err(ErrorCode::TimeEnd.into());
        }
        if now < data_account.start_time{
            return Err(ErrorCode::StreamNotStarted.into());
        }

        if data_account.paused ==1{
            let time_spent = now - data_account.paused_at;
            let paused_start_time = data_account.start_time + time_spent;
            let paused_amount = data_account.allowed_amt(paused_start_time);
            let current_amount = data_account.allowed_amt(now);
            let total_amount_to_sent = current_amount - paused_amount;
            data_account.amount = data_account.amount - total_amount_to_sent;
            data_account.paused = 0;
            data_account.start_time += time_spent;
            data_account.end_time += time_spent;
            data_account.paused_at = 0;
        }
        else{
            data_account.paused = 1;
            data_account.withdraw_limit = allowed_amt;
            data_account.paused_at = now;
        }
        Ok(())
    }
    pub fn token_stream(
        ctx:Context<TokenStream>,
        start_time:u64,
        end_time:u64,
        amount:u64,
        withdraw_limit:Option<u64>,
    ) ->Result<()>
        {
        let now = Clock::get()?.unix_timestamp as u64; 
        if now >= end_time{
            return Err(ErrorCode::TimeEnd.into());
        }
        if start_time >= end_time {
            return Err(ErrorCode::InvalidInstruction.into());
        }
        ctx.accounts.withdraw_data.amount=amount;
        let escrow =&mut ctx.accounts.data_account;
        escrow.start_time = start_time;
        escrow.end_time = end_time;
        escrow.paused = 0;
        escrow.withdraw_limit = withdraw_limit;
        escrow.sender = *ctx.accounts.source_account.key;
        escrow.receiver = *ctx.accounts.dest_account.key;
        escrow.amount = amount;
        escrow.token_mint = ctx.accounts.mint.key();
        escrow.withdrawn = 0;
        escrow.paused_at = 0;
        Ok(())
        }
    pub fn withdraw_token_stream(
        ctx: Context<TokenWithdrawStream>,
        amount: u64,
    )   ->Result<()>{
        let escrow =&mut ctx.accounts.data_account;
        let now = Clock::get()?.unix_timestamp as u64;
        if now <= escrow.start_time {
            msg!("Stream has not been started");
            return Err(ErrorCode::StreamNotStarted.into());
        }
            // Recipient can only withdraw the money that is already streamed. 
            let mut allowed_amt = escrow.allowed_amt(now);
            if now >= escrow.end_time {
                allowed_amt = escrow.amount;
            }
            allowed_amt -=  escrow.withdrawn;
            if amount>allowed_amt {
            msg!("{} is not yet streamed.",amount);
            return Err(ErrorCode::InsufficientFunds.into());
        }
        msg!("{}",amount);
        if escrow.paused == 1 && Some(amount) > escrow.withdraw_limit {
            msg!("{:?} is your withdraw limit",escrow.withdraw_limit);
            return Err(ProgramError::InsufficientFunds.into());
        }
        let comission: u64 = 25*amount/10000; 
        let receiver_amount:u64=amount-comission;

        //data_account signer seeds
        let map = ctx.bumps;
        let (_key, bump) = map.iter().next_back().unwrap();
        let bump=bump.to_be_bytes();            
        let inner = vec![
            ctx.accounts.source_account.key.as_ref(),
            bump.as_ref(),
        ];
        let outer = vec![inner.as_slice()];
        //transfering receiver amount
        create_transfer_token_signed(ctx.accounts.token_program.to_account_info(), 
                                     ctx.accounts.pda_account_token_account.to_account_info(),
                                     ctx.accounts.dest_token_account.to_account_info(),
                                     ctx.accounts.zebec_vault.to_account_info(),
                                     outer.clone(),
                                     receiver_amount)?;
         //transfering comission amount
         create_transfer_token_signed(  ctx.accounts.token_program.to_account_info(), 
                                        ctx.accounts.pda_account_token_account.to_account_info(),
                                        ctx.accounts.fee_reciever_token_account.to_account_info(),
                                        ctx.accounts.zebec_vault.to_account_info(),
                                        outer,
                                        comission)?;  

        if escrow.paused == 1{
            msg!("{:?}{}",escrow.withdraw_limit,amount);
            let mut tmp =escrow.withdraw_limit.unwrap();
            tmp=tmp-amount;
            escrow.withdraw_limit=Some(tmp);
        }
        escrow.withdrawn += amount;
        if escrow.withdrawn == escrow.amount { 
            let dest_starting_lamports = ctx.accounts.source_account.lamports();
            **ctx.accounts.source_account.lamports.borrow_mut() = dest_starting_lamports
                .checked_add(ctx.accounts.data_account.to_account_info().lamports())
                .ok_or(ErrorCode::Overflow)?;
            **ctx.accounts.data_account.to_account_info().lamports.borrow_mut() = 0;
        }
        ctx.accounts.withdraw_data.amount-=amount;
        Ok(())
    }
    pub fn deposit_token(
        ctx: Context<TokenDeposit>,
        amount: u64,
    )   ->Result<()>{
        
        let transfer_instruction = Transfer{
            from: ctx.accounts.source_account_token_account.to_account_info(),
            to: ctx.accounts.pda_account_token_account.to_account_info(),
            authority: ctx.accounts.source_account.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), 
                                    transfer_instruction);

        anchor_spl::token::transfer(cpi_ctx, amount)?;
        Ok(())
    }
    pub fn pause_resume_token_stream(
        ctx: Context<PauseTokenStream>,
    ) -> Result<()> {
        let data_account = &mut ctx.accounts.data_account;
        let now = Clock::get()?.unix_timestamp as u64;
        let allowed_amt = data_account.allowed_amt(now);
        if now >= data_account.end_time {
            return Err(ErrorCode::TimeEnd.into());
        }
        if now < data_account.start_time{
            return Err(ErrorCode::StreamNotStarted.into());
        }

        if data_account.paused ==1{
            let time_spent = now - data_account.paused_at;
            let paused_start_time = data_account.start_time + time_spent;
            let paused_amount = data_account.allowed_amt(paused_start_time);
            let current_amount = data_account.allowed_amt(now);
            let total_amount_to_sent = current_amount - paused_amount;
            data_account.amount = data_account.amount - total_amount_to_sent;
            data_account.paused = 0;
            data_account.start_time += time_spent;
            data_account.end_time += time_spent;
            data_account.paused_at = 0;
        }
        else{
            data_account.paused = 1;
            data_account.withdraw_limit = Some(allowed_amt);
            data_account.paused_at = now;
        }
        Ok(())
    }
    pub fn create_multisig(
        ctx: Context<MultisigSafe>,
        signers: Vec<Pubkey>,
        m: u64
    ) -> Result<()> {
        let data_account = &mut ctx.accounts.data_account;
        data_account.signers = signers;
        data_account.m = m;
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
    pub data_account:  Account<'info, Stream>,
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
        constraint = data_account.receiver == receiver.key(),
        constraint = data_account.sender == sender.key()
    )]
    pub data_account:  Account<'info, Stream>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct Pause<'info> {
    pub sender: Signer<'info>,
    /// CHECK: test
    pub receiver: AccountInfo<'info>,
    #[account(mut,
        constraint = data_account.receiver == receiver.key(),
        constraint = data_account.sender == sender.key()
    )]
    pub data_account:  Account<'info, Stream>,
}

#[derive(Accounts)]
pub struct TokenStream<'info> {
    #[account(init,payer=source_account, space=20+8+8+8+8+8+32+32+32+8+8)]
    pub data_account:  Account<'info, StreamToken>,
    #[account(
        init,
        payer=source_account,
        seeds = [
            PREFIX_TOKEN.as_bytes(),
            source_account.key().as_ref(),
            mint.key().as_ref(),
        ],bump,
        space=20+1,
    )]
    pub withdraw_data: Account<'info, TokenWithdraw>,
    #[account(mut)]
    pub source_account: Signer<'info>,
    /// CHECK:
    pub dest_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub token_program:Program<'info,Token>,
    pub mint:Account<'info,Mint>,
    pub rent: Sysvar<'info, Rent>
}
#[derive(Accounts)]
pub struct TokenDeposit<'info> {
    //PDA
    #[account(
        init,
        payer=source_account,
        seeds = [
            source_account.key().as_ref(),
        ],bump,
        space=0,
    )]
    /// CHECK:
    pub zebec_vault: AccountInfo<'info>,

    #[account(mut)]
    pub source_account: Signer<'info>,

    //Program Accounts
    pub system_program: Program<'info, System>,
    pub token_program:Program<'info,Token>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,

    //Mint and Token Account
    pub mint:Account<'info,Mint>,
    #[account(
        mut,
        constraint= source_account_token_account.owner == source_account.key(),
        constraint= source_account_token_account.mint == mint.key()
    )]
    source_account_token_account: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = source_account,
        associated_token::mint = mint,
        associated_token::authority = zebec_vault,
    )]
    pda_account_token_account: Account<'info, TokenAccount>,
}
#[derive(Accounts)]
pub struct TokenWithdrawStream<'info> {

     //masterPDA
     #[account(
        seeds = [
            source_account.key().as_ref(),
        ],bump,
    )]
    /// CHECK:
    pub zebec_vault: AccountInfo<'info>,
    #[account(mut)]
    pub dest_account: Signer<'info>,
    //User Account
    #[account()]
    /// CHECK:
    pub source_account: AccountInfo<'info>,
    #[account(mut,
        constraint= fee_receiver.key()==Pubkey::from_str(FEERECEIVER).unwrap()
    )]
    /// CHECK:
    pub fee_receiver:AccountInfo<'info>,
    //data account
    #[account(mut,
            owner=id(),
            constraint= data_account.sender==source_account.key(),
            constraint= data_account.receiver==dest_account.key(),            
        )]
    pub data_account:  Account<'info, StreamToken>,
    //withdraw data
    #[account(
        mut,
        seeds = [
            PREFIX_TOKEN.as_bytes(),
            source_account.key().as_ref(),
            mint.key().as_ref(),
        ],bump,
    )]
    pub withdraw_data: Account<'info, TokenWithdraw>,
     //Program Accounts
    pub system_program: Program<'info, System>,
    pub token_program:Program<'info,Token>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
    //Mint and Token Accounts
    pub mint:Account<'info,Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = zebec_vault,
    )]
    pda_account_token_account: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = dest_account,
        associated_token::mint = mint,
        associated_token::authority = dest_account,
    )]
    dest_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = dest_account,
        associated_token::mint = mint,
        associated_token::authority = fee_receiver,
    )]
    fee_reciever_token_account: Box<Account<'info, TokenAccount>>,
}
#[derive(Accounts)]
pub struct MultisigSafe<'info> {
    #[account(
        init,
        payer=sender,
        seeds = [
            PREFIXMULTISIG.as_bytes(),
            data_account.key().as_ref(),
        ],bump,
        space=200+1+8,
    )]
    /// CHECK
    pub multisig_safe: AccountInfo<'info>,
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(init, payer=sender,signer, space=32*11+8+32)]
    pub data_account:  Account<'info, Multisig>,
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

#[account]
pub struct StreamToken {
    pub start_time: u64,
    pub end_time: u64,
    pub paused: u64,
    pub withdraw_limit: Option<u64>,
    pub amount: u64,
    pub sender:   Pubkey,
    pub receiver: Pubkey,
    pub token_mint: Pubkey,
    pub withdrawn: u64,
    pub paused_at: u64,
}
    impl StreamToken {
        pub fn allowed_amt(&self, now: u64) -> u64 {
            (
            ((now - self.start_time) as f64) / ((self.end_time - self.start_time) as f64) * self.amount as f64
            ) as u64 
        }
    }
#[account]
pub struct TokenWithdraw {
    pub amount: u64
}
#[derive(Accounts)]
pub struct PauseTokenStream<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: test
    pub receiver: AccountInfo<'info>,
    #[account(mut,
        constraint = data_account.receiver == receiver.key(),
        constraint = data_account.sender == sender.key()
    )]
    pub data_account:  Account<'info, StreamToken>,
}
#[account]
pub struct Multisig{
    pub signers: Vec<Pubkey>,
    pub m: u64,
    pub multisig_safe: Pubkey,
}

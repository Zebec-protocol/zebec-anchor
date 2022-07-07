use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{Mint, Token, TokenAccount,}};
declare_id!("3svmYpJGih9yxkgqpExNdQZLKQ7Wu5SEjaVUbmbytUJg");

pub mod utils;
pub mod error;
use crate::{utils::{create_transfer,create_transfer_signed,create_transfer_token_signed,create_transfer_token},error::ErrorCode};


pub const PREFIX: &str = "withdraw_sol";
pub const PREFIX_TOKEN: &str = "withdraw_token";
pub const PREFIXVAULT: &str = "vault";
pub const PREFIXMULTISIGSAFE: &str = "multisig_safe";
pub const OPERATE: &str ="NewVaultOption";
pub const OPERATEDATA: &str ="NewVaultOptionData";

#[program]

mod zebec {
    use super::*;
    pub fn create_vault(
        ctx:Context<SetCreate>,
        fee_percentage:u64
    )->Result<()>{
        let data_create = &mut ctx.accounts.create_vault_data;
        data_create.owner=ctx.accounts.owner.key();
        data_create.vault_address=ctx.accounts.fee_vault.key();
        //for 0.25 % fee percentage should be sent 25
        //which is divided by 10000 to get 0.25%
        data_create.fee_percentage=fee_percentage; 
        Ok(())
    }
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
        let withdraw_state = &mut ctx.accounts.withdraw_data;
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
        data_account.sender = ctx.accounts.sender.key();
        data_account.receiver = ctx.accounts.receiver.key();
        data_account.fee_owner=ctx.accounts.fee_owner.key();
        data_account.paused_amt=0;
        withdraw_state.amount+=amount;
        Ok(())
    }
    pub fn withdraw_stream(
        ctx: Context<Withdraw>,
    ) -> Result<()> {
        let data_account = &mut ctx.accounts.data_account;
        let withdraw_state = &mut ctx.accounts.withdraw_data;
        let zebec_vault =&mut  ctx.accounts.zebec_vault;
        let now = Clock::get()?.unix_timestamp as u64;
        if now <= data_account.start_time {
            return Err(ErrorCode::StreamNotStarted.into());
        }
        //Calculated Amount
        let mut allowed_amt = data_account.allowed_amt(now);
        //If end time total amount is allocated
        if now >= data_account.end_time {
            allowed_amt = data_account.amount;
        }
        //if paused only the amount equal to withdraw limit is allowed
        if data_account.paused == 1  
        {
            allowed_amt=data_account.withdraw_limit;
        }
        //allowed amount is subtracted from paused amount
        allowed_amt = allowed_amt.checked_sub(data_account.paused_amt).ok_or(ErrorCode::PausedAmountExceeds)?;
        //allowed amount is subtracted from withdrawn  
        allowed_amt = allowed_amt.checked_sub(data_account.withdrawn).ok_or(ErrorCode::AlreadyWithdrawnStreamingAmount)?;
        
        if allowed_amt > zebec_vault.lamports()
        {
            return Err(ErrorCode::InsufficientFunds.into());
        }
        let comission: u64 = ctx.accounts.create_vault_data.fee_percentage*allowed_amt/10000; 
        let receiver_amount:u64=allowed_amt-comission;
        //receiver amount
        create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.receiver.to_account_info(),receiver_amount)?;
        //commission
        create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.fee_vault.to_account_info(),comission)?;

        data_account.withdrawn= data_account.withdrawn.checked_add(allowed_amt).ok_or(ErrorCode::NumericalOverflow)?;
        if data_account.withdrawn == data_account.amount { 
            create_transfer_signed(data_account.to_account_info(),ctx.accounts.sender.to_account_info(), data_account.to_account_info().lamports())?;
        }
        withdraw_state.amount-=allowed_amt;
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
            let amount_paused_at=data_account.allowed_amt(data_account.paused_at);
            let allowed_amt_now = data_account.allowed_amt(now);
            data_account.paused_amt +=allowed_amt_now-amount_paused_at;
            data_account.paused = 0;
            data_account.paused_at = 0;
        }
        else{
            data_account.paused = 1;
            data_account.withdraw_limit = allowed_amt;
            data_account.paused_at = now;
        }
        Ok(())
    }
    pub fn cancel_stream(
        ctx: Context<Cancel>,
    ) -> Result<()> {
        let data_account = &mut ctx.accounts.data_account;
        let withdraw_state = &mut ctx.accounts.withdraw_data;
        let zebec_vault =&mut  ctx.accounts.zebec_vault;
        let now = Clock::get()?.unix_timestamp as u64;
        //Calculated Amount
        let mut allowed_amt = data_account.allowed_amt(now);
        if now >= data_account.end_time {
            msg!("Stream already completed");
            return Err(ErrorCode::StreamNotStarted.into());
        }
        //if paused only the amount equal to withdraw limit is allowed
        if data_account.paused == 1 
        {
            allowed_amt=data_account.withdraw_limit;
        }
        //allowed amount is subtracted from paused amount
        allowed_amt = allowed_amt.checked_sub(data_account.paused_amt).ok_or(ErrorCode::PausedAmountExceeds)?;
        //allowed amount is subtracted from withdrawn 
        allowed_amt = allowed_amt.checked_sub(data_account.withdrawn).ok_or(ErrorCode::AlreadyWithdrawnStreamingAmount)?;
       
        if now < data_account.start_time {
            allowed_amt = 0;
        }
  
        if allowed_amt > zebec_vault.lamports()
        {
            return Err(ErrorCode::InsufficientFunds.into());
        }
        //commission is calculated
        let comission: u64 = ctx.accounts.create_vault_data.fee_percentage*allowed_amt/10000;
        let receiver_amount:u64=allowed_amt-comission;
        //transfering allowable amount to the receiver
        //receiver amount
        create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.receiver.to_account_info(),receiver_amount)?;
        //commission
        create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.fee_vault.to_account_info(),comission)?;
        //changing withdraw state
        withdraw_state.amount-=data_account.amount-data_account.withdrawn;
        //closing the data account to end the stream
        create_transfer_signed(data_account.to_account_info(),ctx.accounts.sender.to_account_info(), data_account.to_account_info().lamports())?;       
        Ok(())
    } 
    pub fn initializer_native_withdrawal(
        ctx: Context<InitializerWithdrawal>,
        amount: u64,
    ) ->Result<()>{
        let withdraw_state = &mut ctx.accounts.withdraw_data;
        let zebec_vault =&mut  ctx.accounts.zebec_vault;
        if amount > zebec_vault.lamports()
        {
        return Err(ErrorCode::InsufficientFunds.into());
        }
        if withdraw_state.amount ==0 
        {
        create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.sender.to_account_info(),amount)?;
        }
        else
        {
        let allowed_amt = zebec_vault.lamports() - amount;
        if allowed_amt < withdraw_state.amount {
            return Err(ErrorCode::StreamedAmt.into()); 
        }
        create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.sender.to_account_info(),amount)?;
        }
        Ok(())
    }
    pub fn token_stream(
        ctx:Context<TokenStream>,
        start_time:u64,
        end_time:u64,
        amount:u64,
    ) ->Result<()>
        {
        let now = Clock::get()?.unix_timestamp as u64; 
        if now >= end_time{
            return Err(ErrorCode::TimeEnd.into());
        }
        if start_time >= end_time {
            return Err(ErrorCode::InvalidInstruction.into());
        }
        ctx.accounts.withdraw_data.amount+=amount;
        let data_account =&mut ctx.accounts.data_account;
        data_account.start_time = start_time;
        data_account.end_time = end_time;
        data_account.paused = 0;
        data_account.withdraw_limit = 0;
        data_account.sender = *ctx.accounts.source_account.key;
        data_account.receiver = *ctx.accounts.dest_account.key;
        data_account.amount = amount;
        data_account.token_mint = ctx.accounts.mint.key();
        data_account.withdrawn = 0;
        data_account.paused_at = 0;
        data_account.paused_amt=0;
        data_account.fee_owner= ctx.accounts.fee_owner.key();
        Ok(())
        }
    pub fn withdraw_token_stream(
        ctx: Context<TokenWithdrawStream>,
    )   ->Result<()>{
        let data_account =&mut ctx.accounts.data_account;
        let withdraw_state =&mut ctx.accounts.withdraw_data;
        let vault_token_account=&mut ctx.accounts.pda_account_token_account;
        let now = Clock::get()?.unix_timestamp as u64;
        if now <= data_account.start_time {
            msg!("Stream has not been started");
            return Err(ErrorCode::StreamNotStarted.into());
        }
        //Calculated Amount
        let mut allowed_amt = data_account.allowed_amt(now);
        //If end time total amount is allocated
        if now >= data_account.end_time {
            allowed_amt = data_account.amount;
        }
        //if paused only the amount equal to withdraw limit is allowed
        if data_account.paused == 1  
        {
            allowed_amt=data_account.withdraw_limit;
        }
        //allowed amount is subtracted from paused amount
        allowed_amt = allowed_amt.checked_sub(data_account.paused_amt).ok_or(ErrorCode::PausedAmountExceeds)?;
        //allowed amount is subtracted from withdrawn  
        allowed_amt = allowed_amt.checked_sub(data_account.withdrawn).ok_or(ErrorCode::AlreadyWithdrawnStreamingAmount)?;
        if allowed_amt > vault_token_account.amount
        {
            return Err(ErrorCode::InsufficientFunds.into());
        }
        let comission: u64 = ctx.accounts.create_vault_data.fee_percentage*allowed_amt/10000; 
        let receiver_amount:u64=allowed_amt-comission;
        //vault signer seeds
        let bump = ctx.bumps.get("zebec_vault").unwrap().to_le_bytes();             
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

        data_account.withdrawn= data_account.withdrawn.checked_add(allowed_amt).ok_or(ErrorCode::NumericalOverflow)?;
        if data_account.withdrawn == data_account.amount { 
            create_transfer_signed(data_account.to_account_info(),ctx.accounts.source_account.to_account_info(), data_account.to_account_info().lamports())?;
        } 
        withdraw_state.amount-=allowed_amt;      
        Ok(())
    }
    pub fn deposit_token(
        ctx: Context<TokenDeposit>,
        amount: u64,
    )   ->Result<()>{        
        //transfering tokens
        create_transfer_token(
        ctx.accounts.token_program.to_account_info(), 
        ctx.accounts.source_account_token_account.to_account_info(),
        ctx.accounts.pda_account_token_account.to_account_info(),
        ctx.accounts.source_account.to_account_info(), 
        amount)?;
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
            let amount_paused_at=data_account.allowed_amt(data_account.paused_at);
            let allowed_amt_now = data_account.allowed_amt(now);
            data_account.paused_amt +=allowed_amt_now-amount_paused_at;
            data_account.paused = 0;
            data_account.paused_at = 0;
        }
        else{
            data_account.paused = 1;
            data_account.withdraw_limit = allowed_amt;
            data_account.paused_at = now;
        }
        Ok(())
    }
    pub fn cancel_token_stream(
        ctx: Context<CancelTokenStream>,
    )   ->Result<()>{
        let data_account =&mut ctx.accounts.data_account;
        let withdraw_state = &mut ctx.accounts.withdraw_data;
        let vault_token_account=&mut ctx.accounts.pda_account_token_account;
        let now = Clock::get()?.unix_timestamp as u64;
        //Calculated Amount
        let mut allowed_amt = data_account.allowed_amt(now);
        if now >= data_account.end_time {
            msg!("Stream already completed");
            return Err(ErrorCode::StreamNotStarted.into());
        }
        //if paused only the amount equal to withdraw limit is allowed
        if data_account.paused == 1  
        {
            allowed_amt=data_account.withdraw_limit;
        }
        //allowed amount is subtracted from paused amount
        allowed_amt = allowed_amt.checked_sub(data_account.paused_amt).ok_or(ErrorCode::PausedAmountExceeds)?;
        //allowed amount is subtracted from withdrawn  
        allowed_amt = allowed_amt.checked_sub(data_account.withdrawn).ok_or(ErrorCode::AlreadyWithdrawnStreamingAmount)?;
        if now < data_account.start_time {
            allowed_amt = 0;
        }  
        if allowed_amt > vault_token_account.amount
        {
            return Err(ErrorCode::InsufficientFunds.into());
        }
        //commission is calculated
        let comission: u64 = ctx.accounts.create_vault_data.fee_percentage*allowed_amt/10000; 
        let receiver_amount:u64=allowed_amt-comission;
        //vault signer seeds
        let bump = ctx.bumps.get("zebec_vault").unwrap().to_le_bytes();     
        let inner = vec![
            ctx.accounts.source_account.key.as_ref(),
            bump.as_ref(),
        ];
        let outer = vec![inner.as_slice()];
        //transfering allowable amount to the receiver
        //receiver amount
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
                //changing withdraw state
                withdraw_state.amount-=data_account.amount-data_account.withdrawn;
         //closing the data account to end the stream
        create_transfer_signed(data_account.to_account_info(),ctx.accounts.source_account.to_account_info(), data_account.to_account_info().lamports())?; 

        Ok(())
    }
    pub fn initializer_token_withdrawal(
        ctx: Context<InitializerTokenWithdrawal>,
        amount: u64,
    ) -> Result<()>{
        let withdraw_state = &mut ctx.accounts.withdraw_data;
        let vault_token_account=&mut ctx.accounts.pda_account_token_account;
        if amount > vault_token_account.amount
        {
        return Err(ErrorCode::InsufficientFunds.into());
        }
         //vault signer seeds
         let bump = ctx.bumps.get("zebec_vault").unwrap().to_le_bytes();            
         let inner = vec![
             ctx.accounts.source_account.key.as_ref(),
             bump.as_ref(),
         ];
         let outer = vec![inner.as_slice()];
        if withdraw_state.amount ==0 
        {
         //transfering amount
         create_transfer_token_signed(ctx.accounts.token_program.to_account_info(), 
         ctx.accounts.pda_account_token_account.to_account_info(),
         ctx.accounts.source_account_token_account.to_account_info(),
         ctx.accounts.zebec_vault.to_account_info(),
         outer.clone(),
         amount)?;
        }
        else
        {
        let allowed_amt = vault_token_account.amount - amount;
        if allowed_amt < withdraw_state.amount {
            return Err(ErrorCode::StreamedAmt.into()); 
        }
        //transfering receiver amount
        create_transfer_token_signed(ctx.accounts.token_program.to_account_info(), 
        ctx.accounts.pda_account_token_account.to_account_info(),
        ctx.accounts.source_account_token_account.to_account_info(),
        ctx.accounts.zebec_vault.to_account_info(),
        outer.clone(),
        amount)?;
        }
        Ok(())
    }
    pub fn withdraw_fees_token(
        ctx: Context<WithdrawFeesToken>,
    )->Result<()>{
        //data_account signer seeds
        let bump = ctx.bumps.get("fee_vault").unwrap().to_le_bytes();          
        let inner = vec![
            ctx.accounts.fee_owner.key.as_ref(),
            OPERATE.as_bytes(), 
            bump.as_ref(),
        ];
        let outer = vec![inner.as_slice()];
        create_transfer_token_signed(
            ctx.accounts.token_program.to_account_info(), 
            ctx.accounts.fee_reciever_vault_token_account.to_account_info(),
            ctx.accounts.fee_owner_token_account.to_account_info(), 
            ctx.accounts.fee_vault.to_account_info(), 
            outer, 
            ctx.accounts.fee_reciever_vault_token_account.amount)?;
        Ok(())
    }
    pub fn withdraw_fees_sol(
        ctx: Context<WithdrawFeesSol>,
    )->Result<()>{
        create_transfer_signed(ctx.accounts.fee_vault.to_account_info(),ctx.accounts.fee_owner.to_account_info(),ctx.accounts.fee_vault.lamports())?;
        Ok(())
    }

}

#[derive(Accounts)]
pub struct InitializeMasterPda<'info> {
    #[account(    
        init_if_needed,
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
    #[account(zero)]
    pub data_account:  Box<Account<'info, Stream>>,
    #[account(
        init_if_needed,
        payer=sender,
        seeds = [
            PREFIX.as_bytes(),
            sender.key().as_ref(),
        ],bump,
        space=200+1+8,
    )]
    pub withdraw_data: Box<Account<'info, StreamedAmt>>,
     /// CHECK:
    pub fee_owner:AccountInfo<'info>,
    #[account(
         seeds = [
             fee_owner.key().as_ref(),
             OPERATEDATA.as_bytes(),
             fee_vault.key().as_ref(),
         ],bump
     )]
    pub create_vault_data: Box<Account<'info,CreateVault>>,
 
    #[account(
         constraint = create_vault_data.owner == fee_owner.key(),
         constraint = create_vault_data.vault_address == fee_vault.key(),
         seeds = [
             fee_owner.key().as_ref(),
             OPERATE.as_bytes(),           
         ],bump,        
     )]
    /// CHECK:
    pub fee_vault:AccountInfo<'info>,
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
        constraint = data_account.sender == sender.key(),
        constraint= data_account.fee_owner==fee_owner.key(), 
    )]
    pub data_account:  Account<'info, Stream>,
    #[account(
        seeds = [
            PREFIX.as_bytes(),
            sender.key().as_ref(),
        ],bump,
    )]
    pub withdraw_data: Box<Account<'info, StreamedAmt>>,    
    /// CHECK:
    pub fee_owner:AccountInfo<'info>,

    #[account(
        seeds = [
            fee_owner.key().as_ref(),
            OPERATEDATA.as_bytes(),
            fee_vault.key().as_ref(),
        ],bump
    )]
    pub create_vault_data: Account<'info,CreateVault>,

    #[account(
        constraint = create_vault_data.owner == fee_owner.key(),
        constraint = create_vault_data.vault_address == fee_vault.key(),
        seeds = [
            fee_owner.key().as_ref(),
            OPERATE.as_bytes(),           
        ],bump,        
    )]
    /// CHECK:
    pub fee_vault:AccountInfo<'info>,
   
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct InitializerWithdrawal<'info> {
    #[account(    
        seeds = [
            sender.key().as_ref(),
        ],bump,
    )]
    /// CHECK: test
    #[account(mut)]
    pub zebec_vault: AccountInfo<'info>,
    #[account(mut)]
    pub sender: Signer<'info>,
    #[account(
        init_if_needed,
        payer=sender,
        seeds = [
            PREFIX.as_bytes(),
            sender.key().as_ref(),
        ],bump,
        space=200+1+8,
    )]
    pub withdraw_data: Box<Account<'info, StreamedAmt>>,     
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
pub struct Cancel<'info> {
   #[account(   
       seeds = [
           sender.key().as_ref(),
       ],bump,
   )]
   /// CHECK: test
   #[account(mut)]
   pub zebec_vault: AccountInfo<'info>,
   #[account(mut)]
   pub sender: Signer<'info>,
    /// CHECK: test
   #[account(mut)]
   pub receiver: AccountInfo<'info>,
   #[account(mut,
       constraint = data_account.receiver == receiver.key(),
       constraint = data_account.sender == sender.key(),
       constraint= data_account.fee_owner==fee_owner.key(),
   )]
   pub data_account:  Account<'info, Stream>,
   #[account(
    seeds = [
        PREFIX.as_bytes(),
        sender.key().as_ref(),
    ],bump,
    )]
    pub withdraw_data: Box<Account<'info, StreamedAmt>>,   
   /// CHECK:
    pub fee_owner:AccountInfo<'info>,
 
   #[account(
       seeds = [
           fee_owner.key().as_ref(),
           OPERATEDATA.as_bytes(),
           fee_vault.key().as_ref(),
       ],bump
   )]
   pub create_vault_data: Account<'info,CreateVault>,
 
   #[account(
       constraint = create_vault_data.owner == fee_owner.key(),
       constraint = create_vault_data.vault_address == fee_vault.key(),
       seeds = [
           fee_owner.key().as_ref(),
           OPERATE.as_bytes(),          
       ],bump,       
   )]
   /// CHECK:
   pub fee_vault:AccountInfo<'info>,
 
   pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct TokenStream<'info> {
    #[account(zero)]
    pub data_account:  Account<'info, StreamToken>,
    #[account(
        init_if_needed,
        payer=source_account,
        seeds = [
            PREFIX_TOKEN.as_bytes(),
            source_account.key().as_ref(),
            mint.key().as_ref(),
        ],bump,
        space=8+8,
    )]
    pub withdraw_data: Account<'info, TokenWithdraw>,
    /// CHECK:
    pub fee_owner:AccountInfo<'info>,
    #[account(
        seeds = [
            fee_owner.key().as_ref(),
            OPERATEDATA.as_bytes(),
            fee_vault.key().as_ref(),
        ],bump
    )]
    pub create_vault_data: Account<'info,CreateVault>,

    #[account(
        constraint = create_vault_data.owner == fee_owner.key(),
        constraint = create_vault_data.vault_address == fee_vault.key(),
        seeds = [
            fee_owner.key().as_ref(),
            OPERATE.as_bytes(),           
        ],bump,        
    )]
    /// CHECK:
    pub fee_vault:AccountInfo<'info>,
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
        init_if_needed,
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
pub struct InitializerTokenWithdrawal<'info> {
    //PDA
    #[account(
        seeds = [
            source_account.key().as_ref(),
        ],bump,
    )]
    /// CHECK:
    pub zebec_vault: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer=source_account,
        seeds = [
            PREFIX_TOKEN.as_bytes(),
            source_account.key().as_ref(),
            mint.key().as_ref(),
        ],bump,
        space=8+8,
    )]
    pub withdraw_data: Account<'info, TokenWithdraw>,
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
        mut,
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
    #[account(mut)]
    /// CHECK:
    pub source_account: AccountInfo<'info>,
    /// CHECK:
    pub fee_owner:AccountInfo<'info>,

    #[account(
        seeds = [
            fee_owner.key().as_ref(),
            OPERATEDATA.as_bytes(),
            fee_vault.key().as_ref(),
        ],bump
    )]
    pub create_vault_data: Account<'info,CreateVault>,

    #[account(
        constraint = create_vault_data.owner == fee_owner.key(),
        constraint = create_vault_data.vault_address == fee_vault.key(),
        seeds = [
            fee_owner.key().as_ref(),
            OPERATE.as_bytes(),           
        ],bump,        
    )]
    /// CHECK:
    pub fee_vault:AccountInfo<'info>,
   
    //data account
    #[account(mut,
            owner=id(),
            constraint= data_account.sender==source_account.key(),
            constraint= data_account.receiver==dest_account.key(),    
            constraint= data_account.fee_owner==fee_owner.key(),           
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
    pda_account_token_account: Box<Account<'info, TokenAccount>>,
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
        associated_token::authority = fee_vault,
    )]
    fee_reciever_token_account: Box<Account<'info, TokenAccount>>,
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
#[derive(Accounts)]
pub struct CancelTokenStream<'info> {
    //masterPDA
   #[account(
       seeds = [
           source_account.key().as_ref(),
       ],bump,
   )]
   /// CHECK:
   pub zebec_vault: AccountInfo<'info>,
   #[account(mut)]
    /// CHECK:
   pub dest_account: AccountInfo<'info>,
   //User Account
   #[account(mut)]
   pub source_account: Signer<'info>,
   /// CHECK:
   pub fee_owner:AccountInfo<'info>, 
   #[account(
       seeds = [
           fee_owner.key().as_ref(),
           OPERATEDATA.as_bytes(),
           fee_vault.key().as_ref(),
       ],bump
   )]
   pub create_vault_data: Account<'info,CreateVault>, 
   #[account(
       constraint = create_vault_data.owner == fee_owner.key(),
       constraint = create_vault_data.vault_address == fee_vault.key(),
       seeds = [
           fee_owner.key().as_ref(),
           OPERATE.as_bytes(),          
       ],bump,       
   )]
   /// CHECK:
   pub fee_vault:AccountInfo<'info>, 
   //data account
   #[account(mut,
           owner=id(),
           constraint= data_account.sender==source_account.key(),
           constraint= data_account.receiver==dest_account.key(),   
           constraint= data_account.fee_owner==fee_owner.key(),          
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
   pda_account_token_account: Box<Account<'info, TokenAccount>>,
   #[account(
       init_if_needed,
       payer = source_account,
       associated_token::mint = mint,
       associated_token::authority = dest_account,
   )]
   dest_token_account: Box<Account<'info, TokenAccount>>,
   #[account(
       init_if_needed,
       payer = source_account,
       associated_token::mint = mint,
       associated_token::authority = fee_vault,
   )]
   fee_reciever_token_account: Box<Account<'info, TokenAccount>>,
}
#[derive(Accounts)]
pub struct Vault<'info> {
    #[account(
        init,
        payer=sender,
        seeds = [
            PREFIXVAULT.as_bytes(),
            sender.key().as_ref(),
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
#[derive(Accounts)]
pub struct SetCreate<'info> {
    #[account(
        init,
        payer=owner,
        seeds = [
            owner.key().as_ref(),
            OPERATE.as_bytes(),           
        ],bump,
        space=0,
    )]
    /// CHECK:
    pub fee_vault:AccountInfo<'info>,
    #[account(
        init,
        payer=owner,
        seeds = [
            owner.key().as_ref(),
            OPERATEDATA.as_bytes(),
            fee_vault.key().as_ref(),
        ],bump,
        space=8+32+32+8,
    )]
    /// CHECK:
    pub create_vault_data: Account<'info,CreateVault>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct WithdrawFeesSol<'info> {
    #[account(mut)]
    pub fee_owner:Signer<'info>,
    #[account(
        seeds = [
            fee_owner.key().as_ref(),
            OPERATEDATA.as_bytes(),
            fee_vault.key().as_ref(),
        ],bump
    )]
    pub create_vault_data: Account<'info,CreateVault>,

    #[account(mut,
        constraint = create_vault_data.owner == fee_owner.key(),
        constraint = create_vault_data.vault_address == fee_vault.key(),
        seeds = [
            fee_owner.key().as_ref(),
            OPERATE.as_bytes(),           
        ],bump,        
    )]
    /// CHECK:
    pub fee_vault:AccountInfo<'info>,
    //Program Accounts
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
#[derive(Accounts)]
pub struct WithdrawFeesToken<'info> {
    #[account(mut)]
    pub fee_owner:Signer<'info>,
    #[account(
        seeds = [
            fee_owner.key().as_ref(),
            OPERATEDATA.as_bytes(),
            fee_vault.key().as_ref(),
        ],bump
    )]
    pub create_vault_data: Account<'info,CreateVault>,

    #[account(mut,
        constraint = create_vault_data.owner == fee_owner.key(),
        constraint = create_vault_data.vault_address == fee_vault.key(),
        seeds = [
            fee_owner.key().as_ref(),
            OPERATE.as_bytes(),           
        ],bump,        
    )]
    /// CHECK:
    pub fee_vault:AccountInfo<'info>,

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
        associated_token::authority = fee_vault,
    )]
    fee_reciever_vault_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = fee_owner,
        associated_token::mint = mint,
        associated_token::authority = fee_owner,
    )]
    fee_owner_token_account: Box<Account<'info, TokenAccount>>,
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
    pub paused_at: u64,
    pub fee_owner:Pubkey,
    pub paused_amt:u64,
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
    pub amount: u64,
    pub counter: u8
}

#[account]
pub struct StreamToken {
    pub start_time: u64,
    pub end_time: u64,
    pub paused: u64,
    pub withdraw_limit: u64,
    pub amount: u64,
    pub sender:   Pubkey,
    pub receiver: Pubkey,
    pub token_mint: Pubkey,
    pub withdrawn: u64,
    pub paused_at: u64,
    pub fee_owner:Pubkey,
    pub paused_amt:u64,
}
    impl StreamToken {
        pub fn allowed_amt(&self, now: u64) -> u64 {
            (
            ((now - self.start_time) as f64) / ((self.end_time - self.start_time) as f64) * self.amount as f64
            ) as u64 
        }
    }
#[account]
pub struct CreateVault
{
    pub vault_address:Pubkey,
    pub owner:Pubkey,
    pub fee_percentage:u64,
}    
#[account]
pub struct TokenWithdraw {
    pub amount: u64
}
#[account]
pub struct Multisig{
    pub signers: Vec<Pubkey>,
    pub m: u64,
    pub multisig_safe: Pubkey,
}

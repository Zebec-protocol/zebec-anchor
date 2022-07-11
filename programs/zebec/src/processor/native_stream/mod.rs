use anchor_lang::prelude::*;
use crate::{utils::{create_transfer,create_transfer_signed,check_overflow},error::ErrorCode,constants::*,create_fee_account::CreateVault};

pub fn process_deposit_sol(
    ctx: Context<InitializeMasterPda>,
    amount: u64
)-> Result<()> {
    let acc = ctx.accounts.system_program.to_account_info();  
    create_transfer(ctx.accounts.sender.to_account_info(),ctx.accounts.zebec_vault.to_account_info(),acc,amount)?;
    Ok(())
}
pub fn process_native_stream(
    ctx: Context<Initialize>,
    start_time: u64,
    end_time: u64,
    amount: u64
) -> Result<()> {
    let data_account = &mut ctx.accounts.data_account;
    let withdraw_state = &mut ctx.accounts.withdraw_data;
    check_overflow(start_time, end_time)?;
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
pub fn process_withdraw_stream(
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
pub fn process_pause_stream(
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
pub fn process_cancel_stream(
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
pub fn process_native_withdrawal(
    ctx: Context<InitializerWithdrawal>,
    amount: u64,
) ->Result<()>{
    let withdraw_state = &mut ctx.accounts.withdraw_data;
    let zebec_vault =&mut  ctx.accounts.zebec_vault;

    if amount > zebec_vault.lamports()
    {
    return Err(ErrorCode::InsufficientFunds.into());
    }
    // if no any stream is started allow the withdrawal w/o further checks
    if withdraw_state.amount ==0 
    {
    create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.sender.to_account_info(),amount)?;
    }
    else
    {
    //Check remaining amount after withdrawal
    let allowed_amt = zebec_vault.lamports() - amount;
    //if remaining amount is lesser then the required amount for stream stop making withdrawal 
    if allowed_amt < withdraw_state.amount {
        return Err(ErrorCode::StreamedAmt.into()); 
    }
    create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.sender.to_account_info(),amount)?;
    }
    Ok(())
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
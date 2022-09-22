use anchor_lang::prelude::*;
use crate::{utils::{create_transfer,create_transfer_signed,check_overflow,calculate_comission},error::ErrorCode,constants::*,create_fee_account::FeeVaultData};
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
    amount: u64,
    can_cancel:bool,
    can_update:bool,
) -> Result<()> {
    let data_account = &mut ctx.accounts.data_account;
    let withdraw_state = &mut ctx.accounts.withdraw_data;
    let fee_percentage = ctx.accounts.fee_vault_data.fee_percentage;
    check_overflow(start_time, end_time)?;
    data_account.start_time = start_time;
    data_account.end_time = end_time;
    data_account.paused = 0;
    data_account.amount = amount;
    data_account.withdraw_limit = 0;
    data_account.sender = ctx.accounts.sender.key();
    data_account.receiver = ctx.accounts.receiver.key();
    data_account.fee_owner=ctx.accounts.fee_owner.key();
    data_account.fee_percentage=fee_percentage;
    data_account.paused_at=0;
    data_account.paused_amt=0;
    data_account.can_cancel=can_cancel;
    data_account.can_update=can_update;
    withdraw_state.amount=withdraw_state.amount.checked_add(amount).ok_or(ErrorCode::NumericalOverflow)?;
    Ok(())
}
pub fn process_update_native_stream(
    ctx: Context<StreamUpdate>,
    start_time: u64,
    end_time: u64,
    amount: u64
) -> Result<()> {
    check_overflow(start_time, end_time)?;
    let now = Clock::get()?.unix_timestamp as u64; 
    let data_account =&mut ctx.accounts.data_account;
    if !data_account.can_update
    {
        return Err(ErrorCode::UpdateNotAllowed.into());
    }
    if now > data_account.start_time
    {
        return Err(ErrorCode::StreamAlreadyStarted.into());
    }
    let previous_amount = data_account.amount;
    ctx.accounts.withdraw_data.amount=ctx.accounts.withdraw_data.amount.checked_sub(previous_amount).ok_or(ErrorCode::NumericalOverflow)?;
    ctx.accounts.withdraw_data.amount=ctx.accounts.withdraw_data.amount.checked_add(amount).ok_or(ErrorCode::NumericalOverflow)?;
    data_account.start_time = start_time;
    data_account.end_time = end_time;
    data_account.amount = amount;
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
    let comission: u64 = calculate_comission(data_account.fee_percentage,allowed_amt)?;
    let receiver_amount:u64=allowed_amt.checked_sub(comission).ok_or(ErrorCode::NumericalOverflow)?;
    //receiver amount
    create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.receiver.to_account_info(),receiver_amount)?;
    //commission
    create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.fee_vault.to_account_info(),comission)?;
    data_account.withdrawn= data_account.withdrawn.checked_add(allowed_amt).ok_or(ErrorCode::NumericalOverflow)?;
    let total_transfered = data_account.withdrawn+data_account.paused_amt;
    if total_transfered >= data_account.amount 
    {
       create_transfer_signed(data_account.to_account_info(),ctx.accounts.sender.to_account_info(),data_account.to_account_info().lamports())?;
    }
    withdraw_state.amount=withdraw_state.amount.checked_sub(allowed_amt).ok_or(ErrorCode::NumericalOverflow)?;
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
        let mut allowed_amt_now = data_account.allowed_amt(now);
        allowed_amt_now=allowed_amt_now.checked_sub(amount_paused_at).ok_or(ErrorCode::NumericalOverflow)?;
        data_account.paused_amt= data_account.paused_amt.checked_add(allowed_amt_now).ok_or(ErrorCode::NumericalOverflow)?;
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
    if !data_account.can_cancel
    {
        return Err(ErrorCode::CancelNotAllowed.into());
    }
    //Calculated Amount
    let mut allowed_amt = data_account.allowed_amt(now);
    if now >= data_account.end_time {
        return Err(ErrorCode::StreamAlreadyCompleted.into());
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
    let comission: u64 = calculate_comission(data_account.fee_percentage,allowed_amt)?;
    let receiver_amount:u64=allowed_amt.checked_sub(comission).ok_or(ErrorCode::NumericalOverflow)?;
    //transfering allowable amount to the receiver
    //receiver amount
    create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.receiver.to_account_info(),receiver_amount)?;
    //commission
    create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.fee_vault.to_account_info(),comission)?;
    //changing withdraw state
    withdraw_state.amount=withdraw_state.amount.checked_add(data_account.withdrawn).ok_or(ErrorCode::NumericalOverflow)?;
    withdraw_state.amount=withdraw_state.amount.checked_sub(data_account.amount).ok_or(ErrorCode::NumericalOverflow)?;
    //closing the data account to end the stream
    Ok(())
} 
pub fn process_native_transfer(
    ctx: Context<InstantTransfer>,
    amount: u64,
) ->Result<()>{
    let withdraw_state = &mut ctx.accounts.withdraw_data;
    let zebec_vault =&mut  ctx.accounts.zebec_vault;

    if amount > zebec_vault.lamports()
    {
    return Err(ErrorCode::InsufficientFunds.into());
    }
    // if no any stream is started allow the instant transfer w/o further checks
    if withdraw_state.amount ==0 
    {
    create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.receiver.to_account_info(),amount)?;
    }
    else
    {
    //Check remaining amount after transfer
    let vault_lamports:u64=zebec_vault.lamports();
    let allowed_amt = vault_lamports.checked_sub(amount).ok_or(ErrorCode::NumericalOverflow)?;
    //if remaining amount is lesser then the required amount for stream stop making withdrawal 
    if allowed_amt < withdraw_state.amount {
        return Err(ErrorCode::StreamedAmt.into()); 
    }
    create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.receiver.to_account_info(),amount)?;
    }
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
    let vault_lamports:u64=zebec_vault.lamports();
    let allowed_amt = vault_lamports.checked_sub(amount).ok_or(ErrorCode::NumericalOverflow)?;
    //if remaining amount is lesser then the required amount for stream stop making withdrawal 
    if allowed_amt < withdraw_state.amount {
        return Err(ErrorCode::StreamedAmt.into()); 
    }
    create_transfer_signed(zebec_vault.to_account_info(),ctx.accounts.sender.to_account_info(),amount)?;
    }
    Ok(())
}
pub fn process_sol_directly(
    ctx:Context<TransferDirect>,
    amount:u64,
) ->Result<()>{
    let acc = ctx.accounts.system_program.to_account_info();  
    create_transfer(ctx.accounts.sender.to_account_info(),ctx.accounts.receiver.to_account_info(),acc,amount)?;
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
    /// CHECK: seeds has been checked
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
        space=8+8,
    )]
    pub withdraw_data: Box<Account<'info, SolWithdraw>>,
    /// CHECK: validated in fee_vault constraint
    pub fee_owner:AccountInfo<'info>,
    #[account(
         seeds = [
             fee_owner.key().as_ref(),
             OPERATEDATA.as_bytes(),
             fee_vault.key().as_ref(),
         ],bump
     )]
    pub fee_vault_data: Box<Account<'info,FeeVaultData>>,
    #[account(
         constraint = fee_vault_data.fee_owner == fee_owner.key(),
         constraint = fee_vault_data.fee_vault_address == fee_vault.key(),
         seeds = [
             fee_owner.key().as_ref(),
             OPERATE.as_bytes(),           
         ],bump,        
     )]
    /// CHECK: seeds has been checked
    pub fee_vault:AccountInfo<'info>,
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: new stream receiver, do not need to be checked
    pub receiver: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct StreamUpdate<'info> {
    #[account(mut,
        constraint = data_account.receiver == receiver.key(),
        constraint = data_account.sender == sender.key(),
    )]
    pub data_account:  Box<Account<'info, Stream>>,
    #[account(mut,
        seeds = [
            PREFIX.as_bytes(),
            sender.key().as_ref(),
        ],bump,
    )]
    pub withdraw_data: Box<Account<'info, SolWithdraw>>,
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: already checked in data account
    pub receiver: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut,   
        seeds = [
            sender.key().as_ref(),
        ],bump,
    )]
    /// CHECK: seeds has been checked
    pub zebec_vault: AccountInfo<'info>,
    #[account(mut)]
    /// CHECK: validated in data_account constraint
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
        mut,
        seeds = [
            PREFIX.as_bytes(),
            sender.key().as_ref(),
        ],bump,
    )]
    pub withdraw_data: Box<Account<'info, SolWithdraw>>,    
    /// CHECK: validated in fee_vault constraint
    pub fee_owner:AccountInfo<'info>,
    #[account(
        seeds = [
            fee_owner.key().as_ref(),
            OPERATEDATA.as_bytes(),
            fee_vault.key().as_ref(),
        ],bump
    )]
    pub fee_vault_data: Account<'info,FeeVaultData>,

    #[account(
        mut,
        constraint = fee_vault_data.fee_owner == fee_owner.key(),
        constraint = fee_vault_data.fee_vault_address == fee_vault.key(),
        seeds = [
            fee_owner.key().as_ref(),
            OPERATE.as_bytes(),           
        ],bump,        
    )]
    /// CHECK: seeds has been checked
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
    /// CHECK: seeds has been checked
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
        space=8+8,
    )]
    pub withdraw_data: Box<Account<'info, SolWithdraw>>,     
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct Pause<'info> {
    pub sender: Signer<'info>,
    /// CHECK: validated in data_account constraint
    pub receiver: AccountInfo<'info>,
    #[account(mut,
        constraint = data_account.receiver == receiver.key(),
        constraint = data_account.sender == sender.key()
    )]
    pub data_account:  Box<Account<'info, Stream>>,
}
#[derive(Accounts)]
pub struct Cancel<'info> {
   #[account(mut,  
       seeds = [
           sender.key().as_ref(),
       ],bump,
   )]
    /// CHECK: seeds has been checked
   pub zebec_vault: AccountInfo<'info>,
   #[account(mut)]
   pub sender: Signer<'info>,
    /// CHECK: validated in data_account constraint
   #[account(mut)]
   pub receiver: AccountInfo<'info>,
   #[account(mut,
       constraint = data_account.receiver == receiver.key(),
       constraint = data_account.sender == sender.key(),
       constraint= data_account.fee_owner==fee_owner.key(),
       close = sender,//to close the data account and send rent exempt lamports to sender
   )]
   pub data_account:  Account<'info, Stream>,
   #[account(
    mut,
    seeds = [
        PREFIX.as_bytes(),
        sender.key().as_ref(),
    ],bump,
    )]
    pub withdraw_data: Box<Account<'info, SolWithdraw>>,
    /// CHECK: validated in fee_vault constraint
    pub fee_owner:AccountInfo<'info>,
    #[account(
       seeds = [
           fee_owner.key().as_ref(),
           OPERATEDATA.as_bytes(),
           fee_vault.key().as_ref(),
       ],bump
    )]
   pub fee_vault_data: Account<'info,FeeVaultData>,
   #[account(mut,
       constraint = fee_vault_data.fee_owner == fee_owner.key(),
       constraint = fee_vault_data.fee_vault_address == fee_vault.key(),
       seeds = [
           fee_owner.key().as_ref(),
           OPERATE.as_bytes(),          
       ],bump,       
   )]
    /// CHECK: seeds has been checked
   pub fee_vault:AccountInfo<'info>, 
   pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct InstantTransfer<'info> {
    #[account(    
        seeds = [
            sender.key().as_ref(),
        ],bump,
    )]
    /// CHECK: seeds has been checked
    #[account(mut)]
    pub zebec_vault: AccountInfo<'info>,
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: This is the receiver account, since the funds are transferred directly, we do not need to check it
    #[account(mut)]
    pub receiver: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer=sender,
        seeds = [
            PREFIX.as_bytes(),
            sender.key().as_ref(),
        ],bump,
        space=8+8,
    )]
    /// CHECK: seeds has been checked
    pub withdraw_data: Box<Account<'info, SolWithdraw>>, 
    pub system_program: Program<'info, System>,
}
#[derive(Accounts)]
pub struct TransferDirect<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK:
    #[account(mut)]
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
    pub paused_at: u64,
    pub fee_owner:Pubkey,
    pub fee_percentage:u64,
    pub paused_amt:u64,
    pub can_cancel:bool,
    pub can_update:bool,
}
impl Stream {
    pub fn allowed_amt(&self, now: u64) -> u64 {
        ((((now - self.start_time) as u128) * self.amount as u128) / (self.end_time - self.start_time) as u128)
        as u64
    }
    
}
#[account]
pub struct SolWithdraw {
    pub amount: u64,
}
#[cfg(test)]
mod tests {
   use super::*;
 
   #[test]
   fn test_withdraw_data()
   {
      let withdraw = &mut example_withdraw_data();
      let amount = 3;
      withdraw.amount+=amount;
      assert_eq!(withdraw.amount,3);

      let withdrawn = 2;
      //when withdrawn
      withdraw.amount-=  withdrawn;

      //when canceled
      withdraw.amount-=amount- withdrawn;  
      assert_eq!(withdraw.amount,0);
   }
   #[test]
   fn test_allowed_amount()
   {
      let stream =example_stream();
  
       assert_eq!(stream.allowed_amt(stream.start_time),0);
       assert_eq!(stream.allowed_amt(stream.end_time),stream.amount);


       
   }
   fn example_stream()->Stream
   {
      
       Stream{
           start_time: 1660820300,
           end_time:   1660820400,
           amount: 100_00_00_000,
           paused: 0,
           withdraw_limit: 10000,
           sender:   Pubkey::default(),
           receiver: Pubkey::default(),
           withdrawn: 0,
           paused_at: 0,
           fee_owner:Pubkey::default(),
           fee_percentage:25,
           paused_amt:0,
           can_cancel:true,
           can_update:true, 
       }
   }
   fn example_withdraw_data()->SolWithdraw
   {
    SolWithdraw{
        amount:0,
    }
   }
}

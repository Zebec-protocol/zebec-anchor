use anchor_lang::prelude::*;
use crate::{utils::{create_transfer_token_signed,create_transfer_token,check_overflow,calculate_comission,StreamStatus},error::ErrorCode,constants::*,create_fee_account::FeeVaultData};
use anchor_spl::{associated_token::AssociatedToken, token::{Mint, Token, TokenAccount,}};

pub fn process_deposit_token(
    ctx: Context<TokenDeposit>,
    amount: u64,
)  ->Result<()>{
    create_transfer_token(
    ctx.accounts.token_program.to_account_info(), 
    ctx.accounts.source_account_token_account.to_account_info(),
    ctx.accounts.pda_account_token_account.to_account_info(),
    ctx.accounts.source_account.to_account_info(), 
    amount)?;
    Ok(())
}
pub fn process_token_stream(
    ctx:Context<TokenStream>,
    start_time:u64,
    end_time:u64,
    amount:u64,
    can_cancel:bool,
    can_update:bool,
) ->Result<()>{
    let withdraw_state = &mut ctx.accounts.withdraw_data;
    let data_account =&mut ctx.accounts.data_account;
    let fee_percentage=ctx.accounts.fee_vault_data.fee_percentage;
    check_overflow(start_time, end_time)?;
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
    data_account.can_cancel=can_cancel;
    data_account.can_update=can_update;
    data_account.fee_owner= ctx.accounts.fee_owner.key();
    data_account.fee_percentage=fee_percentage;
    withdraw_state.amount=withdraw_state.amount.checked_add(amount).ok_or(ErrorCode::NumericalOverflow)?;
    data_account.scheduled()?;
    Ok(())
}
pub fn process_update_token_stream(
    ctx:Context<TokenStreamUpdate>,
    start_time:u64,
    end_time:u64,
    amount:u64,
) ->Result<()>{
    check_overflow(start_time, end_time)?;
    let now = Clock::get()?.unix_timestamp as u64; 
    let data_account =&mut ctx.accounts.data_account;
    if !data_account.can_update
    {
        return Err(ErrorCode::UpdateNotAllowed.into());
    }
    if data_account.status==StreamStatus::Cancelled
    {
        return Err(ErrorCode::StreamCancelled.into());
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
pub fn process_withdraw_token_stream(
    ctx: Context<TokenWithdrawStream>,
)   ->Result<()>{
    let data_account =&mut ctx.accounts.data_account;
    let withdraw_state =&mut ctx.accounts.withdraw_data;
    let vault_token_account=&mut ctx.accounts.pda_account_token_account;
    if data_account.status==StreamStatus::Cancelled
    {
        return Err(ErrorCode::StreamCancelled.into());
    }
    if data_account.status==StreamStatus::Completed
    {
        return Err(ErrorCode::StreamCompleted.into());
    }
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
    if allowed_amt > vault_token_account.amount
    {
        return Err(ErrorCode::InsufficientFunds.into());
    }
    let comission: u64 = calculate_comission(data_account.fee_percentage,allowed_amt)?;
    let receiver_amount:u64=allowed_amt.checked_sub(comission).ok_or(ErrorCode::NumericalOverflow)?;
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
                                    ctx.accounts.fee_receiver_token_account.to_account_info(),
                                    ctx.accounts.zebec_vault.to_account_info(),
                                    outer,
                                    comission)?;  

    data_account.withdrawn= data_account.withdrawn.checked_add(allowed_amt).ok_or(ErrorCode::NumericalOverflow)?;
    let total_transfered = data_account.withdrawn+data_account.paused_amt;
    if total_transfered >= data_account.amount { 
        data_account.completed()?;
    } 
    withdraw_state.amount=withdraw_state.amount.checked_sub(allowed_amt).ok_or(ErrorCode::NumericalOverflow)?;     
    Ok(())
}
pub fn process_pause_resume_token_stream(
    ctx: Context<PauseTokenStream>,
) -> Result<()> {
    let data_account = &mut ctx.accounts.data_account;
    if data_account.status==StreamStatus::Cancelled
    {
        return Err(ErrorCode::StreamCancelled.into());
    }
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
        allowed_amt_now = allowed_amt_now.checked_sub(amount_paused_at).ok_or(ErrorCode::NumericalOverflow)?;
        data_account.paused_amt=data_account.paused_amt.checked_add(allowed_amt_now).ok_or(ErrorCode::NumericalOverflow)?;
        data_account.paused = 0;
        data_account.paused_at = 0;
        data_account.resumed()?;
    }
    else{
        data_account.paused = 1;
        data_account.withdraw_limit = allowed_amt;
        data_account.paused_at = now;
        data_account.paused()?;
    }
    Ok(())
}
pub fn process_cancel_token_stream(
    ctx: Context<CancelTokenStream>,
) ->Result<()>{
    let data_account =&mut ctx.accounts.data_account;
    let withdraw_state = &mut ctx.accounts.withdraw_data;
    let vault_token_account=&mut ctx.accounts.pda_account_token_account;
    if data_account.status==StreamStatus::Cancelled
    {
        return Err(ErrorCode::StreamCancelled.into());
    }
    let now = Clock::get()?.unix_timestamp as u64;
    if !data_account.can_cancel
    {
        return Err(ErrorCode::CancelNotAllowed.into());
    }
    //Calculated Amount
    let mut allowed_amt = data_account.allowed_amt(now);
    if now >= data_account.end_time {
        msg!("Stream already completed");
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
    if allowed_amt > vault_token_account.amount
    {
        return Err(ErrorCode::InsufficientFunds.into());
    }
    //commission is calculated
    let comission: u64 = calculate_comission(data_account.fee_percentage,allowed_amt)?;
    let receiver_amount:u64=allowed_amt.checked_sub(comission).ok_or(ErrorCode::NumericalOverflow)?;
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
                                    ctx.accounts.fee_receiver_token_account.to_account_info(),
                                    ctx.accounts.zebec_vault.to_account_info(),
                                    outer,
                                    comission)?;  
    //changing withdraw state
    withdraw_state.amount=withdraw_state.amount.checked_add(data_account.withdrawn).ok_or(ErrorCode::NumericalOverflow)?;
    withdraw_state.amount=withdraw_state.amount.checked_sub(data_account.amount).ok_or(ErrorCode::NumericalOverflow)?;
    data_account.cancelled()?;   
    Ok(())
}
pub fn process_token_withdrawal(
    ctx: Context<InitializerTokenWithdrawal>,
    amount: u64,
) ->Result<()>{
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
            // if no any stream is started allow the withdrawal w/o further checks
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
     //Check remaining amount after withdrawal
    let vault_tokens:u64=vault_token_account.amount;
    let allowed_amt = vault_tokens.checked_sub(amount).ok_or(ErrorCode::NumericalOverflow)?;
     //if remaining amount is lesser then the required amount for stream stop making withdrawal 
    if allowed_amt < withdraw_state.amount {
        return Err(ErrorCode::StreamedAmt.into()); 
    }
    //transfering 
    create_transfer_token_signed(ctx.accounts.token_program.to_account_info(), 
    ctx.accounts.pda_account_token_account.to_account_info(),
    ctx.accounts.source_account_token_account.to_account_info(),
    ctx.accounts.zebec_vault.to_account_info(),
    outer.clone(),
    amount)?;
    }
    Ok(())
}
pub fn process_instant_token_transfer(
    ctx: Context<TokenInstantTransfer>,
    amount: u64,
) ->Result<()>{
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
    // if no any stream is started allow the instant transfer w/o further checks
    if withdraw_state.amount ==0 
    {
     //transfering amount
     create_transfer_token_signed(ctx.accounts.token_program.to_account_info(), 
     ctx.accounts.pda_account_token_account.to_account_info(),
     ctx.accounts.dest_token_account.to_account_info(),
     ctx.accounts.zebec_vault.to_account_info(),
     outer.clone(),
     amount)?;
    }
    else
    {
     //Check remaining amount after withdrawal
     let vault_tokens:u64=vault_token_account.amount;
     let allowed_amt = vault_tokens.checked_sub(amount).ok_or(ErrorCode::NumericalOverflow)?;
        //if remaining amount is lesser then the required amount for stream stop making withdrawal 
    if allowed_amt < withdraw_state.amount {
        return Err(ErrorCode::StreamedAmt.into()); 
    }
    //transfering 
    create_transfer_token_signed(ctx.accounts.token_program.to_account_info(), 
    ctx.accounts.pda_account_token_account.to_account_info(),
    ctx.accounts.dest_token_account.to_account_info(),
    ctx.accounts.zebec_vault.to_account_info(),
    outer.clone(),
    amount)?;
    }
    Ok(())
}
pub fn process_send_token_directly(
    ctx:Context<TokenDirectTransfer>,
    amount:u64,
) ->Result<()>{
    create_transfer_token(
        ctx.accounts.token_program.to_account_info(), 
        ctx.accounts.source_account_token_account.to_account_info(),
        ctx.accounts.dest_token_account.to_account_info(),
        ctx.accounts.source_account.to_account_info(), 
        amount)?;
      Ok(())
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
    pub withdraw_data: Box<Account<'info, TokenWithdraw>>,
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
    pub source_account: Signer<'info>,
    /// CHECK: new stream receiver, do not need to be checked
    pub dest_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub token_program:Program<'info,Token>,
    pub mint:Account<'info,Mint>,
    pub rent: Sysvar<'info, Rent>
}
#[derive(Accounts)]
pub struct TokenStreamUpdate<'info> {
    #[account(mut,
        constraint= data_account.sender==source_account.key(),
        constraint= data_account.receiver==dest_account.key(), 
        constraint= data_account.token_mint==mint.key(),            
    )]
    pub data_account:  Account<'info, StreamToken>,
    #[account(mut,
        seeds = [
            PREFIX_TOKEN.as_bytes(),
            source_account.key().as_ref(),
            mint.key().as_ref(),
        ],bump
    )]
    pub withdraw_data: Box<Account<'info, TokenWithdraw>>,
    #[account(mut)]
    pub source_account: Signer<'info>,
    /// CHECK: stream receiver checked in data account
    pub dest_account: AccountInfo<'info>,
    pub mint:Account<'info,Mint>,
}
#[derive(Accounts)]
pub struct TokenDeposit<'info> {
    #[account(
        init_if_needed,
        payer=source_account,
        seeds = [
            source_account.key().as_ref(),
        ],bump,
        space=0,
    )]
     /// CHECK: seeds has been checked
    pub zebec_vault: AccountInfo<'info>,
    #[account(mut)]
    pub source_account: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program:Program<'info,Token>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
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
    #[account(
        seeds = [
            source_account.key().as_ref(),
        ],bump,
    )]
    /// CHECK: seeds has been checked
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
    pub withdraw_data: Box<Account<'info, TokenWithdraw>>,
    #[account(mut)]
    pub source_account: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program:Program<'info,Token>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
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
    #[account(
        seeds = [
            source_account.key().as_ref(),
        ],bump,
    )]
    /// CHECK: seeds has been checked
    pub zebec_vault: AccountInfo<'info>,
    #[account(mut)]
    pub dest_account: Signer<'info>,
    #[account(mut)]
    /// CHECK: validated in data_account constraint
    pub source_account: AccountInfo<'info>,
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
        constraint = fee_vault_data.fee_owner == fee_owner.key(),
        constraint = fee_vault_data.fee_vault_address == fee_vault.key(),
        seeds = [
            fee_owner.key().as_ref(),
            OPERATE.as_bytes(),           
        ],bump,        
    )]
    /// CHECK: seeds has been checked
    pub fee_vault:AccountInfo<'info>,
       #[account(mut,
            constraint= data_account.sender==source_account.key(),
            constraint= data_account.receiver==dest_account.key(),    
            constraint= data_account.fee_owner==fee_owner.key(), 
            constraint= data_account.token_mint==mint.key(),          
        )]
    pub data_account:  Account<'info, StreamToken>,
    #[account(
        mut,
        seeds = [
            PREFIX_TOKEN.as_bytes(),
            source_account.key().as_ref(),
            mint.key().as_ref(),
        ],bump,
    )]
    pub withdraw_data: Box<Account<'info, TokenWithdraw>>,
    pub system_program: Program<'info, System>,
    pub token_program:Program<'info,Token>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
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
    fee_receiver_token_account: Box<Account<'info, TokenAccount>>,
}
#[derive(Accounts)]
pub struct TokenInstantTransfer<'info> {
    #[account(
        seeds = [
            source_account.key().as_ref(),
        ],bump,
    )]
    /// CHECK: seeds has been checked
    pub zebec_vault: AccountInfo<'info>,
    /// CHECK: This is the receiver account, since the funds are transferred directly, we do not need to check it
    #[account(mut)]
    pub dest_account: AccountInfo<'info>,
    #[account(mut)]
    pub source_account: Signer<'info>,
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
    pub withdraw_data: Box<Account<'info, TokenWithdraw>>,
    pub system_program: Program<'info, System>,
    pub token_program:Program<'info,Token>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
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
}
#[derive(Accounts)]
pub struct TokenDirectTransfer<'info> {
    #[account(mut)]
    pub source_account: Signer<'info>,
    /// CHECK: This is the receiver account, since the funds are transferred directly, we do not need to check it
    #[account(mut)]
    pub dest_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub token_program:Program<'info,Token>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
    pub mint:Account<'info,Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = source_account,
    )]
    source_account_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = source_account,
        associated_token::mint = mint,
        associated_token::authority = dest_account,
    )]
    dest_token_account: Box<Account<'info, TokenAccount>>,
}
#[derive(Accounts)]
pub struct PauseTokenStream<'info> {
    #[account(mut)]
    pub sender: Signer<'info>,
    /// CHECK: validated in data_account constraint
    pub receiver: AccountInfo<'info>,
    #[account(mut,
        constraint = data_account.receiver == receiver.key(),
        constraint = data_account.sender == sender.key(),
        constraint= data_account.token_mint==mint.key(),
    )]
    pub data_account:  Account<'info, StreamToken>,
    pub mint:Account<'info,Mint>,
}
#[derive(Accounts)]
pub struct CancelTokenStream<'info> {
   #[account(
       seeds = [
           source_account.key().as_ref(),
       ],bump,
   )]
   /// CHECK: seeds has been checked
   pub zebec_vault: AccountInfo<'info>,
   #[account(mut)]
   /// CHECK: validated in data_account constraint
   pub dest_account: AccountInfo<'info>,
   #[account(mut)]
   pub source_account: Signer<'info>,
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
       constraint = fee_vault_data.fee_owner == fee_owner.key(),
       constraint = fee_vault_data.fee_vault_address == fee_vault.key(),
       seeds = [
           fee_owner.key().as_ref(),
           OPERATE.as_bytes(),          
       ],bump,       
   )]
   /// CHECK: seeds has been checked
   pub fee_vault:AccountInfo<'info>, 
   #[account(mut,
           constraint= data_account.sender==source_account.key(),
           constraint= data_account.receiver==dest_account.key(),   
           constraint= data_account.fee_owner==fee_owner.key(),   
       )]
   pub data_account:  Account<'info, StreamToken>,
   #[account(
       mut,
       seeds = [
           PREFIX_TOKEN.as_bytes(),
           source_account.key().as_ref(),
           mint.key().as_ref(),
       ],bump,
   )]
   pub withdraw_data: Box<Account<'info, TokenWithdraw>>,
   pub system_program: Program<'info, System>,
   pub token_program:Program<'info,Token>,
   pub associated_token_program:Program<'info,AssociatedToken>,
   pub rent: Sysvar<'info, Rent>,
   pub mint:Account<'info,Mint>,
   #[account(
       init_if_needed,
       payer = source_account,
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
   fee_receiver_token_account: Box<Account<'info, TokenAccount>>,
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
    pub fee_percentage:u64,
    pub paused_amt:u64,
    pub can_cancel:bool,
    pub can_update:bool,
    pub status:StreamStatus,
}
impl StreamToken {
    pub fn allowed_amt(&self, now: u64) -> u64 {
        ((((now - self.start_time) as u128) * self.amount as u128) / (self.end_time - self.start_time) as u128)
        as u64
    }
    pub fn scheduled(&mut self) -> Result<()>{
        self.status = StreamStatus::Scheduled;
        Ok(())
    }

    pub fn cancelled(&mut self) -> Result<()>{
        self.status = StreamStatus::Cancelled;
        Ok(())
    }
    pub fn resumed(&mut self) -> Result<()>{
        self.status = StreamStatus::Resumed;
        Ok(())
    }
    pub fn paused(&mut self) -> Result<()>{
        self.status = StreamStatus::Paused;
        Ok(())
    }

    pub fn completed(&mut self) -> Result<()>{
        self.status = StreamStatus::Completed;
        Ok(())
    }
}
#[account]
pub struct TokenWithdraw {
    pub amount: u64
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
      let stream = example_stream_token();
  
       assert_eq!(stream.allowed_amt(stream.start_time),0);
       assert_eq!(stream.allowed_amt(stream.end_time),stream.amount);
 
   }
 
   fn example_stream_token()->StreamToken
   {
      
       StreamToken{
           start_time: 1660820300,
           end_time:   1660820400,
           amount: 100_00_00_000,
           paused: 0,
           withdraw_limit: 10000,
           sender:   Pubkey::default(),
           receiver: Pubkey::default(),
           token_mint: Pubkey::default(),
           withdrawn: 0,
           paused_at: 0,
           fee_owner:Pubkey::default(),
           fee_percentage:25,
           paused_amt:0,
           can_cancel:true,
           can_update:true,
           status:StreamStatus::Scheduled,
       }
   }
   fn example_withdraw_data()->TokenWithdraw
   {
    TokenWithdraw{
        amount:0,
    }
   }
}

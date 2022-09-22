
use anchor_lang::prelude::*;
use anchor_spl::token::Transfer;
use crate::{error::ErrorCode};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum StreamStatus {
    Scheduled,
    Completed,
    Paused,
    Resumed,
    Cancelled,      // Transaction has been cancelled
}
pub fn create_transfer<'a>(
    sender: AccountInfo<'a>,
    receiver: AccountInfo<'a>,
    system_program: AccountInfo<'a>,
    amount: u64,
) -> Result<()> {
    let ix = anchor_lang::solana_program::system_instruction::transfer(
        &sender.key(),
        &receiver.key(),
        amount,
    );
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[
            sender.to_account_info(),
            receiver.to_account_info(),
            system_program.to_account_info(),
        ],
    )?;
    Ok(())
}
pub fn create_transfer_signed<'a>(
    sender: AccountInfo<'a>,
    receiver: AccountInfo<'a>,
    amount: u64,
) -> Result<()> {
    **sender.try_borrow_mut_lamports()? = sender
        .lamports()
        .checked_sub(amount)
        .ok_or(ProgramError::InvalidArgument)?;

    **receiver.try_borrow_mut_lamports()? = receiver
        .lamports()
        .checked_add(amount)
        .ok_or(ProgramError::InvalidArgument)?;

    Ok(())
}
pub fn create_transfer_token<'a>
(
 token_program:AccountInfo<'a>,
 sender:    AccountInfo<'a>,
 receiver:  AccountInfo<'a>,
 authority: AccountInfo<'a>,
 receiver_amount: u64,
) -> Result<()> {
    let transfer_instruction = Transfer{
        from: sender,
        to: receiver,
        authority: authority,
    };
    let cpi_ctx = CpiContext::new(token_program, 
                                transfer_instruction,);
    anchor_spl::token::transfer(cpi_ctx, receiver_amount)?;

    Ok(())
}
pub fn create_transfer_token_signed<'a>
(
 token_program:AccountInfo<'a>,
 sender:    AccountInfo<'a>,
 receiver:  AccountInfo<'a>,
 authority: AccountInfo<'a>,
 seeds:     std::vec::Vec<&[&[u8]]>,
 receiver_amount: u64,
) -> Result<()> {
    let transfer_instruction = Transfer{
        from: sender,
        to: receiver,
        authority: authority,
    };
    let cpi_ctx = CpiContext::new_with_signer(token_program, 
                                transfer_instruction,
                                seeds.as_slice());
    anchor_spl::token::transfer(cpi_ctx, receiver_amount)?;

    Ok(())
}
pub fn check_overflow(start_time: u64, end_time: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp as u64; 
    if now >= end_time{
        return Err(ErrorCode::TimeEnd.into());
    }
    if start_time >= end_time {
        return Err(ErrorCode::InvalidInstruction.into());
    }
    Ok(())
}
pub fn calculate_comission(fee_percentage:u64,allowed_amt:u64) -> Result<u64>{
    let mult:u64=fee_percentage.checked_mul(allowed_amt).ok_or(ErrorCode::NumericalOverflow)?;
    let comission:u64=mult.checked_div(10000).ok_or(ErrorCode::NumericalOverflow)?;
    Ok(comission)
}


use anchor_lang::prelude::*;
use solana_program::{program::{invoke},system_instruction};
use crate::{error::ErrorCode};

pub fn create_transfer<'a>(
    sender: AccountInfo<'a>,
    receiver: AccountInfo<'a>,
    system_program: AccountInfo<'a>,
    amount: u64,
) -> Result<()> {
    invoke(
        &system_instruction::transfer(
            sender.key,
            receiver.key,
            amount
        ),
        &[
            sender.to_account_info(),
            receiver.to_account_info(),
            system_program.to_account_info()
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

pub fn get_zabec_vault_address_and_bump_seed(
    sender: &Pubkey,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            &sender.to_bytes(),
        ],
        program_id,
    )
}
pub fn assert_keys_equal(key1: Pubkey, key2: Pubkey) -> Result<()> {
    if key1 != key2 {
        Err(ErrorCode::PublicKeyMismatch.into())
    } else {
        Ok(())
    }
}
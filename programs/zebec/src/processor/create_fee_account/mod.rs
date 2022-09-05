use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{Mint, Token, TokenAccount,}};
use crate::{utils::{create_transfer_signed,create_transfer_token_signed},constants::*,error::ErrorCode};


// Creating fee account. This is used by developers for developing their own protocol on Top of zebec and if they want to take fees from transaction they can use this function to create and set fee account.
pub fn process_create_fee_account(
    ctx:Context<InitializeFeeVault>,
    fee_percentage:u64
)->Result<()>{
    require!(
        fee_percentage <= 10000,
        ErrorCode::OutOfBound
    );
    let data_create = &mut ctx.accounts.fee_vault_data;
    data_create.fee_owner=ctx.accounts.fee_owner.key();
    data_create.fee_vault_address=ctx.accounts.fee_vault.key();
    //for 0.25 % fee percentage should be sent 25
    //which is divided by 10000 to get 0.25%
    data_create.fee_percentage=fee_percentage; 
    Ok(())
}
pub fn process_withdraw_fees_token(
    ctx: Context<WithdrawFeesToken>,
)->Result<()>{
    let bump = ctx.bumps.get("fee_vault").unwrap().to_le_bytes();          
    let inner = vec![
        ctx.accounts.fee_owner.key.as_ref(),
        OPERATE.as_bytes(), 
        bump.as_ref(),
    ];
    let outer = vec![inner.as_slice()];
    create_transfer_token_signed(
        ctx.accounts.token_program.to_account_info(), 
        ctx.accounts.fee_receiver_vault_token_account.to_account_info(),
        ctx.accounts.fee_owner_token_account.to_account_info(), 
        ctx.accounts.fee_vault.to_account_info(), 
        outer, 
        ctx.accounts.fee_receiver_vault_token_account.amount)?;
    Ok(())
}
pub fn process_withdraw_fees_sol(
    ctx: Context<WithdrawFeesSol>,
)->Result<()>{
    create_transfer_signed(ctx.accounts.fee_vault.to_account_info(),ctx.accounts.fee_owner.to_account_info(),ctx.accounts.fee_vault.lamports())?;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeFeeVault<'info> {
    #[account(
        init,
        payer=fee_owner,
        seeds = [
            fee_owner.key().as_ref(),
            OPERATE.as_bytes(),           
        ],bump,
        space=0,
    )]
    /// CHECK: seeds has been checked
    pub fee_vault:AccountInfo<'info>,
    #[account(
        init,
        payer=fee_owner,
        seeds = [
            fee_owner.key().as_ref(),
            OPERATEDATA.as_bytes(),
            fee_vault.key().as_ref(),
        ],bump,
        space=8+32+32+8,
    )]
    /// CHECK: new account initialize, do not need to be validated
    pub fee_vault_data: Account<'info,FeeVaultData>,
    #[account(mut)]
    pub fee_owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
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
    pub token_program:Program<'info,Token>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
    pub mint:Account<'info,Mint>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = fee_vault,
    )]
    fee_receiver_vault_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = fee_owner,
        associated_token::mint = mint,
        associated_token::authority = fee_owner,
    )]
    fee_owner_token_account: Box<Account<'info, TokenAccount>>,
}
#[account]
pub struct FeeVaultData
{
    pub fee_vault_address:Pubkey,
    pub fee_owner:Pubkey,
    pub fee_percentage:u64,
} 

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creating_fee_owner() 
    {
        let fee_owner= Pubkey::default();
        let program_id =Pubkey::default();
        let fee_percentage=25;
        let (vault_address,_)=Pubkey::find_program_address( &[
            &fee_owner.key().to_bytes(),
            OPERATE.as_bytes(),
        ],
        &program_id);
        let vault_data = FeeVaultData
        {
            fee_owner:fee_owner,
            fee_vault_address:vault_address,
            fee_percentage:fee_percentage,
        };
    
        assert_eq!(vault_data.fee_owner, fee_owner);
        assert_eq!(vault_data.fee_vault_address, vault_address);
        assert_eq!(vault_data.fee_percentage,fee_percentage);
    }

}

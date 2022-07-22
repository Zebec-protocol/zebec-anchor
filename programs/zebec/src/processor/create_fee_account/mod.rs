use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{Mint, Token, TokenAccount,}};
use crate::{utils::{create_transfer_signed,create_transfer_token_signed},constants::*};

// Creating fee account. This is used by developers for developing their own protocol on Top of zebec and if they want to take fees from transaction they can use this function to create and set fee account.
pub fn process_create_fee_account(
    ctx:Context<InitializeFeeVault>,
    fee_percentage:u64
)->Result<()>{
    let data_create = &mut ctx.accounts.vault_data;
    data_create.owner=ctx.accounts.owner.key();
    data_create.vault_address=ctx.accounts.fee_vault.key();
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
        ctx.accounts.fee_reciever_vault_token_account.to_account_info(),
        ctx.accounts.fee_owner_token_account.to_account_info(), 
        ctx.accounts.fee_vault.to_account_info(), 
        outer, 
        ctx.accounts.fee_reciever_vault_token_account.amount)?;
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
    pub vault_data: Account<'info,Vault>,
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
    pub vault_data: Account<'info,Vault>,

    #[account(mut,
        constraint = vault_data.owner == fee_owner.key(),
        constraint = vault_data.vault_address == fee_vault.key(),
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
    pub vault_data: Account<'info,Vault>,

    #[account(mut,
        constraint = vault_data.owner == fee_owner.key(),
        constraint = vault_data.vault_address == fee_vault.key(),
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
pub struct Vault
{
    pub vault_address:Pubkey,
    pub owner:Pubkey,
    pub fee_percentage:u64,
} 
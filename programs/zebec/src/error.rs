use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Lamport balance below rent-exempt threshold")]
    NotRentExempt,
    #[msg("Account not associated with this Escrow")]
    EscrowMismatch,
    #[msg("Owner does not match")]
    OwnerMismatch,
    #[msg("Invalid instruction")]
    InvalidInstruction,
    #[msg("Time has already passed")]
    TimeEnd,
    #[msg("Start time cannot be equal to end time")]
    StartTimeOverFlow,
    #[msg("Stream already cancelled")]
    AlreadyCancel,
    #[msg("Paused stream, streamed amount already withdrawn")]
    AlreadyWithdrawn,
    #[msg("Operation overflowed")]
    Overflow,
    #[msg("Public key mismatched")]
    PublicKeyMismatch,
    #[msg("Transaction is already paused")]
    AlreadyPaused,
    #[msg("Transaction is not paused")]
    AlreadyResumed,
    #[msg("Stream Already Created")]
    StreamAlreadyCreated,
    #[msg("Stream has not been started")]
    StreamNotStarted,
    #[msg("Stream already completed")]
    StreamAlreadyCompleted,
    #[msg("Cannot withdraw streaming amount")]
    StreamedAmt,
    #[msg("Cannot cancel this transaction")]
    CancelNotAllowed,
    #[msg("An account's balance was too small to complete the instruction")]
    InsufficientFunds,
    #[msg("Already Withdrawn streamed amount")]
    AlreadyWithdrawnStreamingAmount,
    #[msg("NumericalOverflow")]
    NumericalOverflow,
    #[msg("PausedAmountExceeds")]
    PausedAmountExceeds,
    #[msg("StreamAlreadyStarted")]
    StreamAlreadyStarted,
    #[msg("UpdateNotAllowed")]
    UpdateNotAllowed,
    #[msg("OutOfBound")]
    OutOfBound,
}
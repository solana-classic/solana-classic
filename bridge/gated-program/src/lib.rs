#![allow(unexpected_cfgs)]
//! Separate experimental entrypoint. Existing V2 implementation and artifacts stay unchanged.
use borsh::BorshDeserialize;
use classic_bridge_program::state::*;
use solana_program::{account_info::AccountInfo,entrypoint::ProgramResult,
    program_error::ProgramError,pubkey::Pubkey,rent::Rent,sysvar::Sysvar};
#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

fn selected_config(program:&Pubkey,account:&AccountInfo)->Result<Config,ProgramError>{
    if account.owner!=program || account.executable {return Err(ProgramError::IllegalOwner);}
    let c=Config::try_from_slice(&account.try_borrow_data()?).map_err(|_|ProgramError::InvalidAccountData)?;
    c.validate()?;
    let expected=Pubkey::find_program_address(&[b"config",&c.bridge],program).0;
    if *account.key!=expected{return Err(ProgramError::InvalidSeeds);}Ok(c)
}
fn owned_pda(program:&Pubkey,account:&AccountInfo,seeds:&[&[u8]])->ProgramResult{
    if account.owner!=program || account.executable{return Err(ProgramError::IllegalOwner);}
    if *account.key!=Pubkey::find_program_address(seeds,program).0{return Err(ProgramError::InvalidSeeds);}Ok(())
}
// Read-only trailer: vault, immutable bootstrap record, consumed bootstrap claim.
// Bootstrap is a committee attestation, not independent source/backing verification.
fn bootstrap_gate(program:&Pubkey,state:&AccountInfo,c:&Config,trailer:&[AccountInfo],minimum_rent:u64)->ProgramResult{
    if trailer.len()!=3 || c.side!=NATIVE || c.epoch!=1{return Err(BAD);}
    let vault=&trailer[0];let record=&trailer[1];let consumed=&trailer[2];
    owned_pda(program,vault,&[b"vault",state.key.as_ref()])?;
    owned_pda(program,record,&[b"bootstrap",state.key.as_ref()])?;
    let b=BootstrapRecord::try_from_slice(&record.try_borrow_data()?).map_err(|_|ProgramError::InvalidAccountData)?;
    if b.magic!=BOOTSTRAP_MAGIC || b.source_event==[0;32]{return Err(BAD);}
    let floor=b.witness.protected_floor(c,b.origin_amount,minimum_rent)?;
    if b.protected_native!=floor{return Err(BAD);}
    owned_pda(program,consumed,&[b"claim",state.key.as_ref(),&b.source_event])?;
    if consumed.try_borrow_data()?.as_ref()!=b.source_event{return Err(ProgramError::InvalidAccountData);}
    let v=vault.try_borrow_data()?;
    if v.len()!=16 || v[..8]!=VAULT_MAGIC || v[8..16]!=floor.to_le_bytes() || vault.lamports()<floor{return Err(BAD);}Ok(())
}

pub fn process_instruction(program:&Pubkey,accounts:&[AccountInfo],data:&[u8])->ProgramResult{
    let instruction=BridgeInstruction::try_from_slice(data).map_err(|_|ProgramError::InvalidInstructionData)?;
    let state_index=match instruction{
        BridgeInstruction::SetPause{..}=>Some(0),
        BridgeInstruction::Claim(_)|BridgeInstruction::Deposit{..}=>Some(1),
        _=>None,
    };
    if let Some(index)=state_index{
        let state=accounts.get(index).ok_or(ProgramError::NotEnoughAccountKeys)?;
        let c=selected_config(program,state)?;
        let opens=match instruction{BridgeInstruction::SetPause{new_locks,settlement}=>!new_locks||!settlement,_=>true};
        if c.side==NATIVE && opens{
            let n=accounts.len().checked_sub(3).ok_or(ProgramError::NotEnoughAccountKeys)?;
            if n<=index{return Err(ProgramError::NotEnoughAccountKeys);}
            bootstrap_gate(program,state,&c,&accounts[n..],Rent::get()?.minimum_balance(16))?;
            return classic_bridge_program::process_instruction(program,&accounts[..n],data);
        }
    }
    // Initialize, one-time Bootstrap, escrow actions and full emergency pause keep core guards.
    classic_bridge_program::process_instruction(program,accounts,data)
}

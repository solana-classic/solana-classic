//! Local in-process SVM tests with synthetic balances/keys. Not two networks,
//! real SOC, source-chain finality, or production security acceptance.
use borsh::BorshDeserialize;
use classic_bridge_program::state::*;
use litesvm::LiteSVM;
use solana_program::{clock::Clock,program_option::COption,program_pack::Pack,pubkey::Pubkey};
use solana_loader_v3_interface::state::UpgradeableLoaderState;
use solana_sdk::{account::Account,instruction::{AccountMeta,Instruction},signature::{Keypair,Signer},transaction::Transaction};
use solana_sdk_ids::{bpf_loader_upgradeable,system_program};
use spl_token_2022::state::{Account as TokenAccount,AccountState,Mint};
use std::path::Path;

fn call(svm:&mut LiteSVM,payer:&Keypair,program:Pubkey,accounts:Vec<AccountMeta>,data:BridgeInstruction,members:&[&Keypair])->bool {
    svm.expire_blockhash();
    let mut signers=vec![payer];for member in members {if member.pubkey()!=payer.pubkey(){signers.push(*member);}}
    let ix=Instruction{program_id:program,accounts,data:borsh::to_vec(&data).unwrap()};
    let tx=Transaction::new_signed_with_payer(&[ix],Some(&payer.pubkey()),&signers,svm.latest_blockhash());
    match svm.send_transaction(tx){Ok(_)=>true,Err(error)=>{eprintln!("Expected/observed runtime rejection: {:?}",error);false}}
}
fn account(svm:&mut LiteSVM,key:Pubkey,owner:Pubkey,data:Vec<u8>,executable:bool){
    svm.set_account(key,Account{lamports:svm.minimum_balance_for_rent_exemption(data.len()),owner,data,executable,..Account::default()}).unwrap();
}
fn install(svm:&mut LiteSVM,program:Pubkey,authority:Pubkey)->Pubkey{
    let elf=std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.tools/bridge-bootstrap-artifacts/classic_bridge_program.so")).expect("Build the separate bootstrap SBF artifact before runtime tests");
    let checksum=solana_program::hash::hash(&elf).to_bytes().iter().map(|b|format!("{b:02x}")).collect::<String>();
    assert_eq!(checksum,"556adf3132c6d102458c0c3b13e22457401bd748b6c3a37a422fb7a339a68e53","Runtime tests require the reviewed V2 artifact");
    let program_data=Pubkey::find_program_address(&[program.as_ref()],&bpf_loader_upgradeable::ID).0;
    let mut bytes=bincode::serialize(&UpgradeableLoaderState::ProgramData{slot:0,upgrade_authority_address:Some(authority)}).unwrap();
    bytes.resize(UpgradeableLoaderState::size_of_programdata_metadata(),0);bytes.extend_from_slice(&elf);
    account(svm,program_data,bpf_loader_upgradeable::ID,bytes,false);
    account(svm,program,bpf_loader_upgradeable::ID,bincode::serialize(&UpgradeableLoaderState::Program{programdata_address:program_data}).unwrap(),true);
    program_data
}
struct Side{svm:LiteSVM,program:Pubkey,state:Pubkey,vault:Pubkey,escrow:Pubkey,program_data:Pubkey,config:Config}
fn side(mode:u8,program:Pubkey,remote:Pubkey,mint:Pubkey,payer:&Keypair,committee:&[Keypair;5])->Side{
    let mut svm=LiteSVM::new();svm.airdrop(&payer.pubkey(),20_000_000_000).unwrap();
    let token_bytes=std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.tools/programs/spl_token_2022-v10.0.0.so")).expect("Install the checksum-pinned official Token-2022 v10 program");
    let checksum=solana_program::hash::hash(&token_bytes).to_bytes().iter().map(|b|format!("{b:02x}")).collect::<String>();
    assert_eq!(checksum,"a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68");
    svm.add_program(spl_token_2022::ID,&token_bytes).unwrap();
    let mut clock=svm.get_sysvar::<Clock>();clock.slot=20;clock.unix_timestamp=86_400;svm.set_sysvar(&clock);
    let program_data=install(&mut svm,program,payer.pubkey());
    let config=Config{magic:CONFIG_MAGIC,bridge:[1;32],local_chain:[if mode==ESCROW{2}else{3};32],remote_chain:[if mode==ESCROW{3}else{2};32],remote_program:remote.to_bytes(),origin_mint:mint.to_bytes(),committee:committee.each_ref().map(|k|k.pubkey().to_bytes()),origin_decimals:6,native_decimals:9,side:mode,threshold:3,epoch:1,new_locks_paused:true,settlement_paused:true,transfer_limit:2_000_000,daily_limit:4_000_000,day:0,daily_settled:0,outstanding:0};
    let state=Pubkey::find_program_address(&[b"config",&config.bridge],&program).0;
    let vault=Pubkey::find_program_address(&[b"vault",state.as_ref()],&program).0;
    let escrow=Pubkey::find_program_address(&[b"escrow",state.as_ref()],&program).0;
    if mode==ESCROW{
        let mut bytes=vec![0;Mint::LEN];Mint::pack(Mint{mint_authority:COption::None,supply:2_000_000,decimals:6,is_initialized:true,freeze_authority:COption::None},&mut bytes).unwrap();
        account(&mut svm,mint,spl_token_2022::ID,bytes,false);
    }
    for member in committee{svm.airdrop(&member.pubkey(),100_000_000).unwrap();}
    Side{svm,program,state,vault,escrow,program_data,config}
}
fn init_accounts(s:&Side,payer:&Keypair)->Vec<AccountMeta>{vec![
    AccountMeta::new(payer.pubkey(),true),AccountMeta::new(s.state,false),AccountMeta::new(s.vault,false),
    AccountMeta::new(if s.config.side==ESCROW{s.escrow}else{payer.pubkey()},false),
    AccountMeta::new_readonly(if s.config.side==ESCROW{Pubkey::new_from_array(s.config.origin_mint)}else{payer.pubkey()},false),
    AccountMeta::new_readonly(spl_token_2022::ID,false),AccountMeta::new_readonly(system_program::ID,false),
    AccountMeta::new_readonly(s.program,false),AccountMeta::new_readonly(s.program_data,false)]}
fn initialize(s:&mut Side,payer:&Keypair){let accounts=init_accounts(s,payer);assert!(call(&mut s.svm,payer,s.program,accounts,BridgeInstruction::Initialize(s.config.clone()),&[]));}
fn unpause(s:&mut Side,payer:&Keypair,members:&[&Keypair]) -> bool {
    let mut accounts=vec![AccountMeta::new(s.state,false)];accounts.extend(members.iter().map(|k|AccountMeta::new_readonly(k.pubkey(),true)));
    call(&mut s.svm,payer,s.program,accounts,BridgeInstruction::SetPause{new_locks:false,settlement:false},members)
}
fn token_balance(s:&Side,key:Pubkey)->u64{TokenAccount::unpack(&s.svm.get_account(&key).unwrap().data).unwrap().amount}
fn set_token(s:&mut Side,key:Pubkey,owner:Pubkey,amount:u64){
    let mut data=vec![0;TokenAccount::LEN];TokenAccount::pack(TokenAccount{mint:Pubkey::new_from_array(s.config.origin_mint),owner,amount,delegate:COption::None,state:AccountState::Initialized,is_native:COption::None,delegated_amount:0,close_authority:COption::None},&mut data).unwrap();account(&mut s.svm,key,spl_token_2022::ID,data,false);
}
fn deposit(s:&mut Side,user:&Keypair,recipient:Pubkey,amount:u64,nonce:u64,source_token:Option<Pubkey>)->Option<Event>{
    let receipt=Pubkey::find_program_address(&[b"event",s.state.as_ref(),user.pubkey().as_ref(),&nonce.to_le_bytes()],&s.program).0;
    let mut accounts=vec![AccountMeta::new(user.pubkey(),true),AccountMeta::new(s.state,false),AccountMeta::new(s.vault,false),AccountMeta::new(receipt,false),AccountMeta::new_readonly(system_program::ID,false)];
    if let Some(token)=source_token {accounts.extend([AccountMeta::new(token,false),AccountMeta::new(s.escrow,false),AccountMeta::new_readonly(Pubkey::new_from_array(s.config.origin_mint),false),AccountMeta::new_readonly(spl_token_2022::ID,false)]);}
    if !call(&mut s.svm,user,s.program,accounts,BridgeInstruction::Deposit{origin_amount:amount,nonce,recipient:recipient.to_bytes()},&[]){return None;}
    Some(Event::try_from_slice(&s.svm.get_account(&receipt).unwrap().data).unwrap())
}
fn claim(s:&mut Side,payer:&Keypair,event:Event,members:&[&Keypair],destination:Option<Pubkey>)->bool{
    let receipt=Pubkey::find_program_address(&[b"claim",s.state.as_ref(),&event.source_event],&s.program).0;
    let mut accounts=vec![AccountMeta::new(payer.pubkey(),true),AccountMeta::new(s.state,false),AccountMeta::new(s.vault,false),AccountMeta::new(receipt,false),AccountMeta::new(Pubkey::new_from_array(event.recipient),false),AccountMeta::new_readonly(system_program::ID,false)];
    if let Some(token)=destination{accounts.extend([AccountMeta::new(s.escrow,false),AccountMeta::new(token,false),AccountMeta::new_readonly(Pubkey::new_from_array(s.config.origin_mint),false),AccountMeta::new_readonly(spl_token_2022::ID,false)]);}
    accounts.extend(members.iter().map(|k|AccountMeta::new_readonly(k.pubkey(),true)));
    call(&mut s.svm,payer,s.program,accounts,BridgeInstruction::Claim(event),members)
}

fn boot_accounts(s:&Side,payer:&Keypair,event:&Event,members:&[&Keypair])->Vec<AccountMeta>{
    let receipt=Pubkey::find_program_address(&[b"claim",s.state.as_ref(),&event.source_event],&s.program).0;
    let record=Pubkey::find_program_address(&[b"bootstrap",s.state.as_ref()],&s.program).0;
    let mut accounts=vec![AccountMeta::new(payer.pubkey(),true),AccountMeta::new(s.state,false),
        AccountMeta::new(s.vault,false),AccountMeta::new(receipt,false),AccountMeta::new(record,false),
        AccountMeta::new_readonly(system_program::ID,false),AccountMeta::new_readonly(s.program,false),
        AccountMeta::new_readonly(s.program_data,false)];
    accounts.extend(members.iter().map(|k|AccountMeta::new_readonly(k.pubkey(),true)));accounts
}
fn bootstrap(s:&mut Side,payer:&Keypair,event:Event,witness:BootstrapWitness,members:&[&Keypair])->bool{
    let accounts=boot_accounts(s,payer,&event,members);
    call(&mut s.svm,payer,s.program,accounts,BridgeInstruction::Bootstrap{event,witness},members)
}
// The witness describes a synthetic budget; it is NOT a total inventory of
// LiteSVM's injected balances/sysvars/fees. Test real Token-2022 source locking,
// cross-VM attestation admission and native state transitions, not genesis.
fn boot_fixture(payer:&Keypair,members:&[Keypair;5])->(Side,Side,Keypair,Pubkey,Keypair,Event,BootstrapWitness){
    let op=Pubkey::new_unique();let np=Pubkey::new_unique();let mint=Pubkey::new_unique();
    let mut origin=side(ESCROW,op,np,mint,payer,members);let mut native=side(NATIVE,np,op,mint,payer,members);
    initialize(&mut origin,payer);initialize(&mut native,payer);
    let source_user=Keypair::new();let recipient=Keypair::new();
    origin.svm.airdrop(&source_user.pubkey(),1_000_000_000).unwrap();native.svm.airdrop(&recipient.pubkey(),100_000_000).unwrap();
    let source=Pubkey::new_unique();set_token(&mut origin,source,source_user.pubkey(),2_000_000);
    assert!(unpause(&mut origin,payer,&[&members[0],&members[1],&members[2]]));
    let event=deposit(&mut origin,&source_user,native.vault,102_000,1,Some(source)).unwrap();
    let mut vault=native.svm.get_account(&native.vault).unwrap();vault.lamports=1_900_000_000;native.svm.set_account(native.vault,vault).unwrap();
    let witness=BootstrapWitness{audit_digest:[42;32],origin_supply:2_000_000,total_native:2_000_000_000,outside_native:100_000_000,reserve_native:1_900_000_000};
    (origin,native,source_user,source,recipient,event,witness)
}

#[test] fn sbf_bootstrap_records_backing_without_release_and_preserves_floor(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let q=[&members[0],&members[1],&members[2]];
    let (mut origin,mut native,user,source,recipient,event,witness)=boot_fixture(&payer,&members);
    let before=native.svm.get_balance(&native.vault).unwrap();let recipient_before=native.svm.get_balance(&recipient.pubkey()).unwrap();
    assert!(bootstrap(&mut native,&payer,event.clone(),witness.clone(),&q));
    assert_eq!(native.svm.get_balance(&native.vault).unwrap(),before);
    assert_eq!(native.svm.get_balance(&recipient.pubkey()).unwrap(),recipient_before);
    let c=Config::try_from_slice(&native.svm.get_account(&native.state).unwrap().data).unwrap();assert_eq!(c.outstanding,102_000);assert!(c.settlement_paused);
    assert_eq!(Config::try_from_slice(&origin.svm.get_account(&origin.state).unwrap().data).unwrap().outstanding,c.outstanding);
    let record=Pubkey::find_program_address(&[b"bootstrap",native.state.as_ref()],&native.program).0;
    let saved=BootstrapRecord::try_from_slice(&native.svm.get_account(&record).unwrap().data).unwrap();
    assert_eq!(saved.witness,witness);assert_eq!(saved.source_event,event.source_event);assert_eq!(saved.protected_native,2_000_000);
    let receipt=Pubkey::find_program_address(&[b"claim",native.state.as_ref(),&event.source_event],&native.program).0;
    assert_eq!(native.svm.get_account(&receipt).unwrap().data,event.source_event);
    assert!(!bootstrap(&mut native,&payer,event.clone(),witness,&q));
    assert!(unpause(&mut native,&payer,&q));
    assert!(!claim(&mut native,&payer,event.clone(),&q,None));
    let mut altered=event.clone();altered.recipient=recipient.pubkey().to_bytes();assert!(!claim(&mut native,&payer,altered,&q,None),"same backing cannot authorize a second release even with a changed recipient");
    let next=deposit(&mut origin,&user,recipient.pubkey(),1_898_000,2,Some(source)).unwrap();
    let mut too_much=next.clone();too_much.origin_amount+=1;
    assert!(!claim(&mut native,&payer,too_much,&q,None),"protected backing stays reserved even above the rent-only floor");
    let next_receipt=Pubkey::find_program_address(&[b"claim",native.state.as_ref(),&next.source_event],&native.program).0;
    assert!(native.svm.get_account(&next_receipt).is_none(),"failed settlement rolls back receipt and counter");
    assert!(claim(&mut native,&payer,next,&q,None));assert_eq!(native.svm.get_balance(&native.vault).unwrap(),2_000_000);
    let returned=deposit(&mut native,&recipient,user.pubkey(),50_000,3,None).unwrap();
    assert!(claim(&mut origin,&payer,returned,&q,Some(source)));
    assert_eq!(token_balance(&origin,source),50_000);assert_eq!(token_balance(&origin,origin.escrow),1_950_000);
    assert_eq!(Config::try_from_slice(&native.svm.get_account(&native.state).unwrap().data).unwrap().outstanding,1_950_000);
    assert_eq!(u64::from_le_bytes(native.svm.get_account(&native.vault).unwrap().data[8..].try_into().unwrap()),2_000_000);
}

#[test] fn sbf_bootstrap_rejects_bad_math_domains_and_insufficient_backing_atomically(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let q=[&members[0],&members[1],&members[2]];
    let (_,mut native,_,_,_,event,witness)=boot_fixture(&payer,&members);
    let baseline=native.svm.get_account(&native.state).unwrap();let vault=native.svm.get_account(&native.vault).unwrap();
    let record=Pubkey::find_program_address(&[b"bootstrap",native.state.as_ref()],&native.program).0;
    for i in 0..9 {
        let mut w=witness.clone();let mut e=event.clone();match i {
            0=>w.audit_digest=[0;32],1=>w.origin_supply=u64::MAX,2=>w.total_native+=1,
            3=>w.reserve_native+=1,4=>{w.outside_native=101_000_000;w.reserve_native=1_899_000_000;},
            5=>e.origin_amount=2_000_001,6=>e.destination_chain=[90;32],7=>e.recipient=payer.pubkey().to_bytes(),_=>e.source_event=[90;32],
        }
        // Match the smaller reserve to isolate the under-rent backing guard.
        let mut attempt_vault=vault.clone();if i==4 {attempt_vault.lamports=w.reserve_native;native.svm.set_account(native.vault,attempt_vault.clone()).unwrap();}
        assert!(!bootstrap(&mut native,&payer,e,w,&q));
        assert_eq!(native.svm.get_account(&native.state).unwrap(),baseline);assert_eq!(native.svm.get_account(&native.vault).unwrap(),attempt_vault);
        native.svm.set_account(native.vault,vault.clone()).unwrap();
        assert!(native.svm.get_account(&record).is_none());
    }
    assert!(bootstrap(&mut native,&payer,event,witness,&q),"rejected witnesses must not consume the valid event");
}

#[test] fn sbf_bootstrap_requires_upgrade_authority_quorum_and_pause(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let q=[&members[0],&members[1],&members[2]];
    let (_,mut native,_,_,_,event,witness)=boot_fixture(&payer,&members);
    let attacker=Keypair::new();native.svm.airdrop(&attacker.pubkey(),1_000_000_000).unwrap();
    assert!(!bootstrap(&mut native,&attacker,event.clone(),witness.clone(),&q));
    assert!(!bootstrap(&mut native,&payer,event.clone(),witness.clone(),&q[..2]));
    assert!(unpause(&mut native,&payer,&q));assert!(!bootstrap(&mut native,&payer,event.clone(),witness.clone(),&q));
    assert_eq!(Config::try_from_slice(&native.svm.get_account(&native.state).unwrap().data).unwrap().outstanding,0);
}

#[test] fn sbf_bootstrap_marker_is_one_time_and_prefunding_cannot_grief(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let q=[&members[0],&members[1],&members[2]];
    let (_,mut native,_,_,_,event,witness)=boot_fixture(&payer,&members);
    let record=Pubkey::find_program_address(&[b"bootstrap",native.state.as_ref()],&native.program).0;
    native.svm.set_account(record,Account{lamports:1,owner:system_program::ID,..Account::default()}).unwrap();
    assert!(bootstrap(&mut native,&payer,event.clone(),witness.clone(),&q));
    // Adversarial VM fixture resets the counter to exercise the persistent
    // one-time marker independently of the counter guard. No real state edit.
    let mut state=native.svm.get_account(&native.state).unwrap();let mut c=Config::try_from_slice(&state.data).unwrap();c.outstanding=0;state.data=borsh::to_vec(&c).unwrap();native.svm.set_account(native.state,state).unwrap();
    let mut vault=native.svm.get_account(&native.vault).unwrap();vault.data[8..].copy_from_slice(&native.svm.minimum_balance_for_rent_exemption(16).to_le_bytes());native.svm.set_account(native.vault,vault).unwrap();
    assert!(!bootstrap(&mut native,&payer,event,witness,&q),"bootstrap PDA cannot be allocated twice even when other guards appear fresh");
}

#[test] fn sbf_bootstrap_receipt_conflict_rolls_back_partial_allocation(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let q=[&members[0],&members[1],&members[2]];
    let (_,mut native,_,_,_,event,witness)=boot_fixture(&payer,&members);
    let record=Pubkey::find_program_address(&[b"bootstrap",native.state.as_ref()],&native.program).0;
    let receipt=Pubkey::find_program_address(&[b"claim",native.state.as_ref(),&event.source_event],&native.program).0;
    account(&mut native.svm,receipt,native.program,event.source_event.to_vec(),false);
    let vault=native.svm.get_account(&native.vault).unwrap();let state=native.svm.get_account(&native.state).unwrap();
    assert!(!bootstrap(&mut native,&payer,event,witness,&q));
    assert!(native.svm.get_account(&record).is_none());assert_eq!(native.svm.get_account(&native.vault).unwrap(),vault);assert_eq!(native.svm.get_account(&native.state).unwrap(),state);
}

#[test] fn sbf_v1_vault_is_rejected_instead_of_silently_upgraded(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let q=[&members[0],&members[1],&members[2]];
    let (_,mut native,_,_,_,event,witness)=boot_fixture(&payer,&members);
    let mut vault=native.svm.get_account(&native.vault).unwrap();vault.data=b"SCVLT001".to_vec();native.svm.set_account(native.vault,vault.clone()).unwrap();
    assert!(!bootstrap(&mut native,&payer,event,witness,&q));assert_eq!(native.svm.get_account(&native.vault).unwrap(),vault);
}

#[test] fn sbf_roundtrip_and_replay_domain_quorum_controls(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let origin_program=Pubkey::new_unique();let native_program=Pubkey::new_unique();let mint=Pubkey::new_unique();
    let mut origin=side(ESCROW,origin_program,native_program,mint,&payer,&members);let mut native=side(NATIVE,native_program,origin_program,mint,&payer,&members);
    initialize(&mut origin,&payer);initialize(&mut native,&payer);
    let a=Keypair::new();let b=Keypair::new();origin.svm.airdrop(&a.pubkey(),1_000_000_000).unwrap();native.svm.airdrop(&b.pubkey(),100_000_000).unwrap();
    let source=Pubkey::new_unique();set_token(&mut origin,source,a.pubkey(),2_000_000);
    assert!(deposit(&mut origin,&a,b.pubkey(),1_000_000,1,Some(source)).is_none(),"new bridge must start paused");
    assert!(!unpause(&mut origin,&payer,&[&members[0],&members[1]]));
    assert!(unpause(&mut origin,&payer,&[&members[0],&members[1],&members[2]]));assert!(unpause(&mut native,&payer,&[&members[0],&members[1],&members[2]]));
    let locked=deposit(&mut origin,&a,b.pubkey(),1_000_000,1,Some(source)).unwrap();
    assert_eq!(token_balance(&origin,origin.escrow),1_000_000);assert_eq!(token_balance(&origin,source),1_000_000);
    let claim_pda=Pubkey::find_program_address(&[b"claim",native.state.as_ref(),&locked.source_event],&native.program).0;
    assert!(!claim(&mut native,&payer,locked.clone(),&[&members[0],&members[1],&members[2]],None),"reserve must actually hold the native units");
    assert!(native.svm.get_account(&claim_pda).is_none(),"failed claim must atomically roll back replay marker");
    let fund=solana_system_interface::instruction::transfer(&payer.pubkey(),&native.vault,2_000_000_000);
    let tx=Transaction::new_signed_with_payer(&[fund],Some(&payer.pubkey()),&[&payer],native.svm.latest_blockhash());native.svm.send_transaction(tx).unwrap();
    assert!(!claim(&mut native,&payer,locked.clone(),&[&members[0],&members[1]],None));
    let mut wrong=locked.clone();wrong.destination_chain=[77;32];assert!(!claim(&mut native,&payer,wrong,&[&members[0],&members[1],&members[2]],None));
    let before=native.svm.get_balance(&b.pubkey()).unwrap();assert!(claim(&mut native,&payer,locked.clone(),&[&members[0],&members[1],&members[2]],None));assert_eq!(native.svm.get_balance(&b.pubkey()).unwrap()-before,1_000_000_000);
    assert!(!claim(&mut native,&payer,locked,&[&members[0],&members[1],&members[3]],None));
    let returned=deposit(&mut native,&b,a.pubkey(),400_000,2,None).unwrap();
    assert!(claim(&mut origin,&payer,returned.clone(),&[&members[0],&members[1],&members[2]],Some(source)));
    assert_eq!(token_balance(&origin,origin.escrow),600_000);assert_eq!(token_balance(&origin,source),1_400_000);
    let c=Config::try_from_slice(&native.svm.get_account(&native.state).unwrap().data).unwrap();assert_eq!(c.outstanding,600_000);
    assert!(!claim(&mut origin,&payer,returned,&[&members[0],&members[1],&members[3]],Some(source)));
    assert!(deposit(&mut origin,&a,b.pubkey(),1,1,Some(source)).is_none(),"a source nonce cannot create a second event");
}

#[test] fn sbf_init_authority_and_prefunded_pda(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let mut s=side(NATIVE,Pubkey::new_unique(),Pubkey::new_unique(),Pubkey::new_unique(),&payer,&members);
    let attacker=Keypair::new();s.svm.airdrop(&attacker.pubkey(),1_000_000_000).unwrap();let accounts=init_accounts(&s,&attacker);
    assert!(!call(&mut s.svm,&attacker,s.program,accounts,BridgeInstruction::Initialize(s.config.clone()),&[]));assert!(s.svm.get_account(&s.state).is_none());
    s.svm.set_account(s.state,Account{lamports:1,owner:system_program::ID,..Account::default()}).unwrap();initialize(&mut s,&payer);
    assert_eq!(Config::try_from_slice(&s.svm.get_account(&s.state).unwrap().data).unwrap().threshold,3);
}

#[test] fn sbf_mutable_mint_is_rejected_before_escrow_creation(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let mut s=side(ESCROW,Pubkey::new_unique(),Pubkey::new_unique(),Pubkey::new_unique(),&payer,&members);
    let mint=Pubkey::new_from_array(s.config.origin_mint);let mut data=s.svm.get_account(&mint).unwrap().data;
    let mut state=Mint::unpack(&data).unwrap();state.mint_authority=COption::Some(payer.pubkey());Mint::pack(state,&mut data).unwrap();account(&mut s.svm,mint,spl_token_2022::ID,data,false);
    let accounts=init_accounts(&s,&payer);assert!(!call(&mut s.svm,&payer,s.program,accounts,BridgeInstruction::Initialize(s.config.clone()),&[]));
    assert!(s.svm.get_account(&s.state).is_none());assert!(s.svm.get_account(&s.escrow).is_none());
}


// Synthetic pre-initialization account injection models a future genesis
// reserve at the selected PDA; it does not generate or accept a real genesis.
fn prefunded_native(payer:&Keypair,members:&[Keypair;5])->Side{
    let mut s=side(NATIVE,Pubkey::new_unique(),Pubkey::new_unique(),Pubkey::new_unique(),payer,members);
    assert!(!s.vault.is_on_curve());
    s.svm.set_account(s.vault,Account{lamports:1_900_000_000,owner:system_program::ID,..Account::default()}).unwrap();
    s
}
fn assert_same_account(actual:Account,expected:&Account){
    assert_eq!(actual.lamports,expected.lamports);assert_eq!(actual.owner,expected.owner);
    assert_eq!(actual.data,expected.data);assert_eq!(actual.executable,expected.executable);assert_eq!(actual.rent_epoch,expected.rent_epoch);
}
fn unsigned_vault_drain(s:&mut Side,payer:&Keypair){
    let before=s.svm.get_account(&s.vault).unwrap();
    s.svm.expire_blockhash();
    let ix=solana_system_interface::instruction::transfer(&s.vault,&payer.pubkey(),1);
    let mut tx=Transaction::new_with_payer(&[ix],Some(&payer.pubkey()));
    tx.partial_sign(&[payer],s.svm.latest_blockhash());
    assert!(s.svm.send_transaction(tx).is_err(),"A transaction without the PDA signature cannot withdraw its reserve");
    assert_same_account(s.svm.get_account(&s.vault).unwrap(),&before);
}
#[test] fn sbf_prefunded_native_vault_preserves_balance_and_starts_paused(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let mut s=prefunded_native(&payer,&members);
    unsigned_vault_drain(&mut s,&payer);
    initialize(&mut s,&payer);
    let vault=s.svm.get_account(&s.vault).unwrap();assert_eq!(vault.lamports,1_900_000_000);assert_eq!(vault.owner,s.program);assert!(!vault.executable);
    assert_eq!(vault.data.len(),16);assert_eq!(&vault.data[..8],b"SCVLT002");assert_eq!(u64::from_le_bytes(vault.data[8..16].try_into().unwrap()),s.svm.minimum_balance_for_rent_exemption(16));
    let c=Config::try_from_slice(&s.svm.get_account(&s.state).unwrap().data).unwrap();assert!(c.new_locks_paused&&c.settlement_paused);assert_eq!(c.outstanding,0);assert_eq!(c.daily_settled,0);
    unsigned_vault_drain(&mut s,&payer);
    let accounts=init_accounts(&s,&payer);assert!(!call(&mut s.svm,&payer,s.program,accounts,BridgeInstruction::Initialize(s.config.clone()),&[]));
    assert_same_account(s.svm.get_account(&s.vault).unwrap(),&vault);
    assert_eq!(borsh::to_vec(&Config::try_from_slice(&s.svm.get_account(&s.state).unwrap().data).unwrap()).unwrap(),borsh::to_vec(&c).unwrap());
}
#[test] fn sbf_prefunded_native_vault_rejects_wrong_authority_and_address_atomically(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let mut s=prefunded_native(&payer,&members);
    let before=s.svm.get_account(&s.vault).unwrap();let attacker=Keypair::new();s.svm.airdrop(&attacker.pubkey(),1_000_000_000).unwrap();
    let accounts=init_accounts(&s,&attacker);assert!(!call(&mut s.svm,&attacker,s.program,accounts,BridgeInstruction::Initialize(s.config.clone()),&[]));
    assert!(s.svm.get_account(&s.state).is_none());assert_same_account(s.svm.get_account(&s.vault).unwrap(),&before);
    let wrong=Pubkey::new_unique();s.svm.set_account(wrong,before.clone()).unwrap();let mut accounts=init_accounts(&s,&payer);accounts[2]=AccountMeta::new(wrong,false);
    assert!(!call(&mut s.svm,&payer,s.program,accounts,BridgeInstruction::Initialize(s.config.clone()),&[]));
    assert!(s.svm.get_account(&s.state).is_none());assert_same_account(s.svm.get_account(&s.vault).unwrap(),&before);assert_same_account(s.svm.get_account(&wrong).unwrap(),&before);
}
#[test] fn sbf_prefunded_native_vault_rejects_foreign_or_initialized_accounts(){
    for foreign in [false,true]{
        let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let mut s=prefunded_native(&payer,&members);
        let mut before=s.svm.get_account(&s.vault).unwrap();if foreign{before.owner=Pubkey::new_unique();}else{before.data=vec![0;16];}
        s.svm.set_account(s.vault,before.clone()).unwrap();let accounts=init_accounts(&s,&payer);
        assert!(!call(&mut s.svm,&payer,s.program,accounts,BridgeInstruction::Initialize(s.config.clone()),&[]));
        assert!(s.svm.get_account(&s.state).is_none());assert_same_account(s.svm.get_account(&s.vault).unwrap(),&before);
    }
}

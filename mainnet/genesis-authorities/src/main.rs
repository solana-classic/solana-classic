//! Offline selected genesis authority decoding. Output is private review data.
use bincode::Options;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use solana_genesis_config::GenesisConfig;
use solana_stake_interface::state::StakeStateV2;
use solana_vote_interface::state::VoteStateV3;
use std::io::Read;
const MAX: usize = 16 * 1024 * 1024;
const SYSTEM: &str = "11111111111111111111111111111111";
const STAKE: &str = "Stake11111111111111111111111111111111111111";
const VOTE: &str = "Vote111111111111111111111111111111111111111";
fn sha(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
fn stake(data: &[u8]) -> Result<Value, &'static str> {
    if data.len() != StakeStateV2::size_of() { return Err("STAKE_LAYOUT_LENGTH"); }
    let state: StakeStateV2 = bincode::options().with_fixint_encoding().with_limit(200).allow_trailing_bytes().deserialize(data).map_err(|_| "STAKE_DECODE")?;
    let (variant, meta, delegation) = match state {
        StakeStateV2::Initialized(meta) => ("initialized", meta, Value::Null),
        StakeStateV2::Stake(meta, stake, _) => ("delegated", meta, json!({"voter":stake.delegation.voter_pubkey.to_string(),"stakeUnits":stake.delegation.stake.to_string(),"activationEpoch":stake.delegation.activation_epoch.to_string(),"deactivationEpoch":stake.delegation.deactivation_epoch.to_string()})),
        _ => return Err("STAKE_AUTHORITY_VARIANT_REQUIRED"),
    };
    if meta.authorized.staker.to_string() == SYSTEM || meta.authorized.withdrawer.to_string() == SYSTEM { return Err("STAKE_ZERO_AUTHORITY"); }
    Ok(json!({"variant":variant,"staker":meta.authorized.staker.to_string(),"withdrawer":meta.authorized.withdrawer.to_string(),"rentExemptReserveUnits":meta.rent_exempt_reserve.to_string(),"lockup":{"unixTimestamp":meta.lockup.unix_timestamp.to_string(),"epoch":meta.lockup.epoch.to_string(),"custodian":meta.lockup.custodian.to_string()},"delegation":delegation}))
}
fn vote(data: &[u8]) -> Result<Value, &'static str> {
    if data.len() != VoteStateV3::size_of() || data.get(..4) != Some(&2u32.to_le_bytes()) { return Err("VOTE_V3_LAYOUT_REQUIRED"); }
    let state = VoteStateV3::deserialize(data).map_err(|_| "VOTE_DECODE")?;
    let voters: Vec<_> = state.authorized_voters().iter().map(|(epoch,key)| json!({"epoch":epoch.to_string(),"voter":key.to_string()})).collect();
    if state.node_pubkey.to_string() == SYSTEM || state.authorized_withdrawer.to_string() == SYSTEM || voters.is_empty() || voters.len() > 64 || voters.iter().any(|v| v["voter"] == SYSTEM) || state.commission > 100 { return Err("VOTE_AUTHORITIES_REQUIRED"); }
    Ok(json!({"version":3,"node":state.node_pubkey.to_string(),"withdrawer":state.authorized_withdrawer.to_string(),"commission":state.commission,"authorizedVoters":voters}))
}
fn review(g: &GenesisConfig, expected_genesis: &str) -> Result<Value, &'static str> {
    let genesis = g.hash().to_string();
    if format!("{:?}", g.cluster_type) != "Development" || genesis != expected_genesis || ["7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon","5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d","EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG","4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY",SYSTEM].contains(&genesis.as_str()) { return Err("ISOLATED_SELECTED_GENESIS_REQUIRED"); }
    if g.accounts.is_empty() || g.accounts.len() > 4096 { return Err("GENESIS_ACCOUNT_BOUND"); }
    let mut accounts=Vec::new(); let mut stakes=Vec::new(); let mut votes=Vec::new(); let mut total=0u128;
    for (key,a) in &g.accounts {
        if a.data.len() > 10*1024*1024 { return Err("ACCOUNT_DATA_BOUND"); }
        total += u128::from(a.lamports);
        let address=key.to_string(); let owner=a.owner.to_string();
        accounts.push(json!({"address":address,"owner":owner,"lamports":a.lamports.to_string(),"dataBytes":a.data.len(),"executable":a.executable,"dataSHA256":sha(&a.data)}));
        if owner == STAKE || owner == VOTE {
            if a.executable { return Err("AUTHORITY_ACCOUNT_EXECUTABLE"); }
            let authorities = if owner == STAKE { stake(&a.data)? } else { vote(&a.data)? };
            let row=json!({"address":address,"nativeUnits":a.lamports.to_string(),"dataSHA256":sha(&a.data),"authorities":authorities});
            if owner == STAKE { stakes.push(row); } else { votes.push(row); }
        }
    }
    if total > u128::from(u64::MAX) { return Err("GENESIS_TOTAL_OVERFLOW"); }
    Ok(json!({"schemaVersion":1,"scope":"offline-selected-isolated-genesis-authorities","genesis":genesis,"accountCount":accounts.len(),"totalNativeUnits":total.to_string(),"accounts":accounts,"stakeAccounts":stakes,"voteAccounts":votes,"genesisAccountBytesDecoded":true,"authorityKeysDecoded":true,"keyCustodyVerified":false,"lockupEnforcementVerified":false,"reserveCustodyVerified":false,"backingVerified":false,"independentOperatorsVerified":false,"consensusVerified":false,"canSign":false,"canBroadcast":false,"mainnetActivated":false,"productionReady":false}))
}
fn decode(bytes: &[u8], expected_genesis: &str, expected_sha: &str) -> Result<Value, &'static str> {
    if bytes.is_empty() || bytes.len() > MAX || expected_sha.len()!=64 || !expected_sha.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c)) || sha(bytes)!=expected_sha { return Err("SELECTED_GENESIS_BYTES_REQUIRED"); }
    let g: GenesisConfig = bincode::options().with_fixint_encoding().with_limit(MAX as u64).reject_trailing_bytes().deserialize(bytes).map_err(|_| "GENESIS_DECODE")?;
    review(&g, expected_genesis)
}
fn main() {
    let args: Vec<_> = std::env::args().collect();
    let result = (|| {
        if args.len()!=4 || args[1]!="--isolated-genesis-stdin" { return Err("EXPECTED_GENESIS_AND_SHA256_REQUIRED"); }
        let mut bytes=Vec::new(); std::io::stdin().take((MAX+1) as u64).read_to_end(&mut bytes).map_err(|_| "GENESIS_INPUT_UNAVAILABLE")?;
        decode(&bytes,&args[2],&args[3])
    })();
    match result { Ok(v)=>println!("{v}"), Err(code)=>{ eprintln!("{code}"); std::process::exit(1); } }
}
#[cfg(test)]
mod tests {
    use super::*;
    use solana_account::Account;
    use solana_stake_interface::state::{Authorized,Lockup,Meta};
    use solana_vote_interface::{authorized_voters::AuthorizedVoters,state::VoteStateVersions};
    fn key(i:u8)->String { solana_stake_interface::state::Authorized::auto(&[i;32].into()).staker.to_string() }
    fn stake_bytes() -> Vec<u8> {
        let m=Meta{rent_exempt_reserve:2,authorized:Authorized{staker:key(1).parse().unwrap(),withdrawer:key(2).parse().unwrap()},lockup:Lockup{unix_timestamp:-3,epoch:u64::MAX,custodian:key(3).parse().unwrap()}};
        let mut b=bincode::serialize(&StakeStateV2::Initialized(m)).unwrap(); b.resize(StakeStateV2::size_of(),0);b
    }
    fn vote_bytes() -> Vec<u8> {
        let v=VoteStateV3{node_pubkey:key(4).parse().unwrap(),authorized_withdrawer:key(5).parse().unwrap(),authorized_voters:AuthorizedVoters::new(0,key(6).parse().unwrap()),commission:7,..VoteStateV3::default()};
        let mut b=vec![0;VoteStateV3::size_of()];VoteStateV3::serialize(&VoteStateVersions::new_v3(v),&mut b).unwrap();b
    }
    fn genesis() -> GenesisConfig {
        let mut g=GenesisConfig::default();g.accounts.insert(key(10).parse().unwrap(),Account{lamports:11,data:stake_bytes(),owner:STAKE.parse().unwrap(),executable:false,rent_epoch:0});g.accounts.insert(key(11).parse().unwrap(),Account{lamports:13,data:vote_bytes(),owner:VOTE.parse().unwrap(),executable:false,rent_epoch:0});g
    }
    #[test] fn distinct_stake_roles_and_exact_lockups() { let r=stake(&stake_bytes()).unwrap();assert_eq!(r["staker"],key(1));assert_eq!(r["withdrawer"],key(2));assert_eq!(r["lockup"]["unixTimestamp"],"-3");assert_eq!(r["lockup"]["epoch"],u64::MAX.to_string());assert_eq!(r["lockup"]["custodian"],key(3)); }
    #[test] fn vote_node_withdrawer_and_voter_are_distinct() { let r=vote(&vote_bytes()).unwrap();assert_eq!(r["node"],key(4));assert_eq!(r["withdrawer"],key(5));assert_eq!(r["authorizedVoters"][0]["voter"],key(6)); }
    #[test] fn unknown_stake_variants_and_lengths_refuse() { for b in [vec![0;200],vec![255;200],vec![0;199],vec![0;201]] {assert!(stake(&b).is_err());} }
    #[test] fn old_or_malformed_vote_versions_refuse() {for version in [0u32,1,3,u32::MAX] {let mut b=vote_bytes();b[..4].copy_from_slice(&version.to_le_bytes());assert!(vote(&b).is_err());}assert!(vote(&[0;10]).is_err());}
    #[test] fn original_genesis_bytes_hash_and_identity_are_both_required() {let g=genesis();let b=bincode::serialize(&g).unwrap();let r=decode(&b,&g.hash().to_string(),&sha(&b)).unwrap();assert_eq!(r["accountCount"],2);assert_eq!(r["totalNativeUnits"],"24");for k in ["keyCustodyVerified","lockupEnforcementVerified","reserveCustodyVerified","backingVerified","independentOperatorsVerified","consensusVerified","canSign","canBroadcast","mainnetActivated","productionReady"] {assert_eq!(r[k],false);}assert!(decode(&b,&key(30),&sha(&b)).is_err());assert!(decode(&b,&g.hash().to_string(),&"0".repeat(64)).is_err());}
    #[test] fn trailing_corrupt_empty_and_oversized_input_refuse() {let g=genesis();let mut b=bincode::serialize(&g).unwrap();b.push(0);assert!(decode(&b,&g.hash().to_string(),&sha(&b)).is_err());assert!(decode(&[],&key(1),&"0".repeat(64)).is_err());assert!(decode(&[0;20],&key(1),&sha(&[0;20])).is_err());let large=vec![0;MAX+1];assert!(decode(&large,&key(1),&sha(&large)).is_err());}
    #[test] fn wrong_cluster_executable_and_overflow_refuse() {let mut g=genesis();g.cluster_type=solana_cluster_type::ClusterType::MainnetBeta;assert!(review(&g,&g.hash().to_string()).is_err());let mut g=genesis();g.accounts.values_mut().next().unwrap().executable=true;assert!(review(&g,&g.hash().to_string()).is_err());let mut g=genesis();g.accounts.values_mut().next().unwrap().lamports=u64::MAX;assert!(review(&g,&g.hash().to_string()).is_err());}
}

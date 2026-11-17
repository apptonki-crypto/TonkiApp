//! Tonki dynamic: one contract instance per post dynamic.
//!
//! Mirrors the rules in `src/lib/posts/dynamics/rules.ts`:
//! - kinds: time_promo, going, promo_code, qr, consumption
//! - lifecycle: active -> exhausted (goal met or manual close) | expired (past `ends_at`)
//! - going/promo_code/qr: one participation per person (`sha256(user_id)`)
//! - consumption: one application per charge (`sha256(charge_id)`), accumulates amount
//!
//! Everything on-chain is public. Promo codes and QR tokens never appear here, only
//! the `config_hash`. The custodial server (`admin`) is the only signer, so the
//! contract proves what the server asserted, not who the end user is.
//!
//! Business outcomes (duplicate, expired, ...) are returned as `Outcome` instead of
//! panicking so that lazy closes performed during the call are persisted.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    Vec,
};

/// Roughly one day of ledgers (5s per ledger).
const DAY_IN_LEDGERS: u32 = 17_280;
/// Keep entries alive for ~30 days after each write (below the network max TTL).
const TTL_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;
/// Renew when fewer than ~15 days remain.
const TTL_THRESHOLD: u32 = 15 * DAY_IN_LEDGERS;

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Kind {
    TimePromo = 0,
    Going = 1,
    PromoCode = 2,
    Qr = 3,
    Consumption = 4,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Status {
    Active = 0,
    Exhausted = 1,
    Expired = 2,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Outcome {
    Recorded = 0,
    AlreadyRecorded = 1,
    Upcoming = 2,
    Exhausted = 3,
    Expired = 4,
    WrongKind = 5,
    BelowMinTicket = 6,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    InvalidConfig = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
}

/// Immutable rules of the dynamic. `0` means "not set" for numeric fields.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub kind: Kind,
    /// Participations / charges that close the dynamic. Unused in amount mode.
    pub goal_count: u32,
    /// Consumption amount goal in centavos (MXN * 100). Amount mode when > 0.
    pub goal_amount: i128,
    /// Consumption minimum ticket in centavos.
    pub min_ticket: i128,
    /// Unix seconds. 0 = starts immediately.
    pub starts_at: u64,
    /// Unix seconds. 0 = no end.
    pub ends_at: u64,
    /// sha256 of the canonical config JSON kept in the database.
    pub config_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct State {
    pub admin: Address,
    pub config: Config,
    pub status: Status,
    pub progress_count: u32,
    pub progress_amount: i128,
    /// Unix seconds. 0 while active.
    pub closed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ChargeEntry {
    pub charge_hash: BytesN<32>,
    pub amount: i128,
}

#[contracttype]
enum DataKey {
    State,
    Participant(BytesN<32>),
    Charge(BytesN<32>),
}

#[contractevent]
pub struct Participated {
    #[topic]
    pub participant: BytesN<32>,
    pub progress_count: u32,
}

#[contractevent]
pub struct ChargeApplied {
    #[topic]
    pub charge: BytesN<32>,
    pub amount: i128,
    pub progress_count: u32,
    pub progress_amount: i128,
}

#[contractevent]
pub struct Closed {
    pub status: Status,
    pub closed_at: u64,
}

fn goal_met(state: &State) -> bool {
    let cfg = &state.config;
    match cfg.kind {
        Kind::TimePromo => false,
        Kind::Going | Kind::Qr => cfg.goal_count > 0 && state.progress_count >= cfg.goal_count,
        Kind::PromoCode => {
            let goal = if cfg.goal_count == 0 { 1 } else { cfg.goal_count };
            state.progress_count >= goal
        }
        Kind::Consumption => {
            if cfg.goal_amount > 0 {
                state.progress_amount >= cfg.goal_amount
            } else {
                cfg.goal_count > 0 && state.progress_count >= cfg.goal_count
            }
        }
    }
}

/// Same precedence as `closeTransition` in rules.ts: goal first, then time.
fn close_transition(state: &State, now: u64) -> Option<Status> {
    if state.status != Status::Active {
        return None;
    }
    if goal_met(state) {
        return Some(Status::Exhausted);
    }
    if state.config.ends_at > 0 && now > state.config.ends_at {
        return Some(Status::Expired);
    }
    None
}

fn load(env: &Env) -> Result<State, Error> {
    env.storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(Error::NotInitialized)
}

fn save(env: &Env, state: &State) {
    env.storage().instance().set(&DataKey::State, state);
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

/// Applies the lazy close and publishes the event. Returns true if it changed state.
fn apply_close(env: &Env, state: &mut State) -> bool {
    let now = env.ledger().timestamp();
    match close_transition(state, now) {
        Some(next) => {
            state.status = next;
            state.closed_at = now;
            Closed {
                status: next,
                closed_at: now,
            }
            .publish(env);
            true
        }
        None => false,
    }
}

fn has_key(env: &Env, key: &DataKey) -> bool {
    env.storage().persistent().has(key)
}

fn mark_key(env: &Env, key: &DataKey) {
    env.storage().persistent().set(key, &true);
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn validate(config: &Config) -> Result<(), Error> {
    if config.goal_amount < 0 || config.min_ticket < 0 {
        return Err(Error::InvalidConfig);
    }
    if config.starts_at > 0 && config.ends_at > 0 && config.ends_at <= config.starts_at {
        return Err(Error::InvalidConfig);
    }
    match config.kind {
        Kind::TimePromo => {
            if config.starts_at == 0 || config.ends_at == 0 {
                return Err(Error::InvalidConfig);
            }
            if config.goal_count != 0 || config.goal_amount != 0 || config.min_ticket != 0 {
                return Err(Error::InvalidConfig);
            }
        }
        Kind::Going => {
            if config.goal_amount != 0 || config.min_ticket != 0 {
                return Err(Error::InvalidConfig);
            }
        }
        Kind::PromoCode => {
            if config.goal_amount != 0 || config.min_ticket != 0 {
                return Err(Error::InvalidConfig);
            }
        }
        Kind::Qr => {
            if config.goal_count == 0 || config.goal_amount != 0 || config.min_ticket != 0 {
                return Err(Error::InvalidConfig);
            }
        }
        Kind::Consumption => {
            // Exactly one goal mode.
            if (config.goal_count == 0) == (config.goal_amount == 0) {
                return Err(Error::InvalidConfig);
            }
        }
    }
    Ok(())
}

#[contract]
pub struct TonkiDynamic;

#[contractimpl]
impl TonkiDynamic {
    /// Deploy and initialize in one transaction. `admin` is the custodial server account.
    pub fn __constructor(env: Env, admin: Address, config: Config) -> Result<(), Error> {
        validate(&config)?;
        let state = State {
            admin,
            config,
            status: Status::Active,
            progress_count: 0,
            progress_amount: 0,
            closed_at: 0,
        };
        save(&env, &state);
        Ok(())
    }

    /// Records one participation for going / promo_code / qr dynamics.
    pub fn participate(env: Env, participant: BytesN<32>) -> Result<Outcome, Error> {
        let mut state = load(&env)?;
        state.admin.require_auth();

        apply_close(&env, &mut state);

        let outcome = Self::guard(&env, &state, &[Kind::Going, Kind::PromoCode, Kind::Qr]);
        if let Some(outcome) = outcome {
            save(&env, &state);
            return Ok(outcome);
        }

        let key = DataKey::Participant(participant.clone());
        if has_key(&env, &key) {
            save(&env, &state);
            return Ok(Outcome::AlreadyRecorded);
        }

        mark_key(&env, &key);
        state.progress_count += 1;
        Participated {
            participant,
            progress_count: state.progress_count,
        }
        .publish(&env);
        apply_close(&env, &mut state);
        save(&env, &state);
        Ok(Outcome::Recorded)
    }

    /// Applies one credited charge to a consumption dynamic. Idempotent per charge.
    /// `amount` is in centavos.
    pub fn apply_consumption(
        env: Env,
        charge: BytesN<32>,
        amount: i128,
    ) -> Result<Outcome, Error> {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let mut state = load(&env)?;
        state.admin.require_auth();

        apply_close(&env, &mut state);

        if let Some(outcome) = Self::guard(&env, &state, &[Kind::Consumption]) {
            save(&env, &state);
            return Ok(outcome);
        }

        if state.config.min_ticket > 0 && amount < state.config.min_ticket {
            save(&env, &state);
            return Ok(Outcome::BelowMinTicket);
        }

        let key = DataKey::Charge(charge.clone());
        if has_key(&env, &key) {
            save(&env, &state);
            return Ok(Outcome::AlreadyRecorded);
        }

        mark_key(&env, &key);
        state.progress_count += 1;
        state.progress_amount += amount;
        ChargeApplied {
            charge,
            amount,
            progress_count: state.progress_count,
            progress_amount: state.progress_amount,
        }
        .publish(&env);
        apply_close(&env, &mut state);
        save(&env, &state);
        Ok(Outcome::Recorded)
    }

    /// Closes as `exhausted` (manual close from an edit). No-op when not active.
    pub fn close(env: Env) -> Result<Status, Error> {
        let mut state = load(&env)?;
        state.admin.require_auth();
        if state.status == Status::Active {
            let now = env.ledger().timestamp();
            state.status = Status::Exhausted;
            state.closed_at = now;
            Closed {
                status: Status::Exhausted,
                closed_at: now,
            }
            .publish(&env);
            save(&env, &state);
        }
        Ok(state.status)
    }

    /// Applies the goal/time transition without recording anything. Used by the close worker.
    pub fn evaluate(env: Env) -> Result<Status, Error> {
        let mut state = load(&env)?;
        state.admin.require_auth();
        if apply_close(&env, &mut state) {
            save(&env, &state);
        }
        Ok(state.status)
    }

    /// Migration only: loads already-known participations / charges without window checks.
    /// Callable in batches while the dynamic is active. Duplicates are ignored.
    pub fn import_batch(
        env: Env,
        participants: Vec<BytesN<32>>,
        charges: Vec<ChargeEntry>,
    ) -> Result<u32, Error> {
        let mut state = load(&env)?;
        state.admin.require_auth();
        if state.status != Status::Active {
            return Ok(state.progress_count);
        }

        for participant in participants.iter() {
            let key = DataKey::Participant(participant);
            if !has_key(&env, &key) {
                mark_key(&env, &key);
                state.progress_count += 1;
            }
        }
        for entry in charges.iter() {
            if entry.amount <= 0 {
                return Err(Error::InvalidAmount);
            }
            let key = DataKey::Charge(entry.charge_hash);
            if !has_key(&env, &key) {
                mark_key(&env, &key);
                state.progress_count += 1;
                state.progress_amount += entry.amount;
            }
        }
        save(&env, &state);
        Ok(state.progress_count)
    }

    /// Anyone can pay to keep the contract alive until `ends_at` plus review time.
    pub fn bump(env: Env) -> Result<(), Error> {
        let state = load(&env)?;
        save(&env, &state);
        Ok(())
    }

    pub fn get_state(env: Env) -> Result<State, Error> {
        load(&env)
    }

    pub fn has_participated(env: Env, participant: BytesN<32>) -> bool {
        has_key(&env, &DataKey::Participant(participant))
    }

    pub fn has_charge(env: Env, charge: BytesN<32>) -> bool {
        has_key(&env, &DataKey::Charge(charge))
    }
}

impl TonkiDynamic {
    /// Same order as the TS flow: wrong kind, exhausted, expired, upcoming.
    fn guard(env: &Env, state: &State, allowed: &[Kind]) -> Option<Outcome> {
        if !allowed.contains(&state.config.kind) {
            return Some(Outcome::WrongKind);
        }
        match state.status {
            Status::Exhausted => return Some(Outcome::Exhausted),
            Status::Expired => return Some(Outcome::Expired),
            Status::Active => {}
        }
        if state.config.starts_at > 0 && env.ledger().timestamp() < state.config.starts_at {
            return Some(Outcome::Upcoming);
        }
        None
    }
}

mod test;

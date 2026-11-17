#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, vec, Address, BytesN, Env};

const T0: u64 = 1_000_000;

struct Fixture<'a> {
    env: Env,
    client: TonkiDynamicClient<'a>,
}

fn hash(env: &Env, n: u8) -> BytesN<32> {
    BytesN::from_array(env, &[n; 32])
}

fn cfg(env: &Env, kind: Kind) -> Config {
    Config {
        kind,
        goal_count: 0,
        goal_amount: 0,
        min_ticket: 0,
        starts_at: 0,
        ends_at: 0,
        config_hash: hash(env, 9),
    }
}

fn setup<'a>(config: impl FnOnce(&Env) -> Config) -> Fixture<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(T0);
    let admin = Address::generate(&env);
    let config = config(&env);
    let id = env.register(TonkiDynamic, (admin, config));
    let client = TonkiDynamicClient::new(&env, &id);
    Fixture { env, client }
}

#[test]
fn rejects_invalid_configs() {
    let env = Env::default();

    // The constructor runs `validate`, so checking it directly covers deploy-time rejection.
    let bad = |c: Config| validate(&c).is_err();

    // time_promo needs both dates
    assert!(bad(cfg(&env, Kind::TimePromo)));
    // qr needs a goal
    assert!(bad(cfg(&env, Kind::Qr)));
    // consumption needs exactly one goal mode
    assert!(bad(cfg(&env, Kind::Consumption)));
    let mut both = cfg(&env, Kind::Consumption);
    both.goal_count = 2;
    both.goal_amount = 100;
    assert!(bad(both));
    // end before start
    let mut window = cfg(&env, Kind::Going);
    window.starts_at = 20;
    window.ends_at = 10;
    assert!(bad(window));
    // going must not carry money fields
    let mut money = cfg(&env, Kind::Going);
    money.goal_amount = 5;
    assert!(bad(money));
    // valid ones pass
    let mut ok = cfg(&env, Kind::Consumption);
    ok.goal_amount = 100;
    assert!(!bad(ok));
    assert!(!bad(cfg(&env, Kind::Going)));
    assert!(!bad(cfg(&env, Kind::PromoCode)));
}

#[test]
fn time_promo_cannot_be_participated_and_expires_after_window() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::TimePromo);
        c.starts_at = T0 - 10;
        c.ends_at = T0 + 100;
        c
    });
    assert_eq!(f.client.participate(&hash(&f.env, 1)), Outcome::WrongKind);

    // Still active inside the window, never exhausted by goal.
    assert_eq!(f.client.evaluate(), Status::Active);

    f.env.ledger().set_timestamp(T0 + 101);
    assert_eq!(f.client.evaluate(), Status::Expired);
    let state = f.client.get_state();
    assert_eq!(state.status, Status::Expired);
    assert_eq!(state.closed_at, T0 + 101);
}

#[test]
fn going_counts_unique_people_and_closes_on_goal() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::Going);
        c.goal_count = 2;
        c
    });
    let a = hash(&f.env, 1);
    let b = hash(&f.env, 2);
    let c = hash(&f.env, 3);

    assert_eq!(f.client.participate(&a), Outcome::Recorded);
    assert_eq!(f.client.participate(&a), Outcome::AlreadyRecorded);
    assert!(f.client.has_participated(&a));
    assert!(!f.client.has_participated(&b));
    assert_eq!(f.client.get_state().progress_count, 1);

    assert_eq!(f.client.participate(&b), Outcome::Recorded);
    let state = f.client.get_state();
    assert_eq!(state.progress_count, 2);
    assert_eq!(state.status, Status::Exhausted);

    // After closing, even a duplicate reports the closed state first.
    assert_eq!(f.client.participate(&c), Outcome::Exhausted);
    assert_eq!(f.client.get_state().progress_count, 2);
}

#[test]
fn going_without_goal_never_exhausts() {
    let f = setup(|e| cfg(e, Kind::Going));
    for n in 1..=5u8 {
        assert_eq!(f.client.participate(&hash(&f.env, n)), Outcome::Recorded);
    }
    assert_eq!(f.client.get_state().status, Status::Active);
}

#[test]
fn promo_code_defaults_to_single_redemption() {
    let f = setup(|e| cfg(e, Kind::PromoCode));
    assert_eq!(f.client.participate(&hash(&f.env, 1)), Outcome::Recorded);
    assert_eq!(f.client.get_state().status, Status::Exhausted);
    assert_eq!(f.client.participate(&hash(&f.env, 2)), Outcome::Exhausted);
}

#[test]
fn promo_code_respects_max_redemptions() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::PromoCode);
        c.goal_count = 3;
        c
    });
    for n in 1..=2u8 {
        assert_eq!(f.client.participate(&hash(&f.env, n)), Outcome::Recorded);
    }
    assert_eq!(f.client.get_state().status, Status::Active);
    assert_eq!(f.client.participate(&hash(&f.env, 3)), Outcome::Recorded);
    assert_eq!(f.client.get_state().status, Status::Exhausted);
}

#[test]
fn qr_requires_goal_and_closes() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::Qr);
        c.goal_count = 1;
        c
    });
    assert_eq!(f.client.participate(&hash(&f.env, 1)), Outcome::Recorded);
    assert_eq!(f.client.get_state().status, Status::Exhausted);
}

#[test]
fn upcoming_window_blocks_until_start() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::Going);
        c.starts_at = T0 + 50;
        c
    });
    assert_eq!(f.client.participate(&hash(&f.env, 1)), Outcome::Upcoming);
    assert_eq!(f.client.get_state().progress_count, 0);

    f.env.ledger().set_timestamp(T0 + 50);
    assert_eq!(f.client.participate(&hash(&f.env, 1)), Outcome::Recorded);
}

#[test]
fn expiry_is_persisted_by_the_failing_participation() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::Going);
        c.ends_at = T0 + 10;
        c
    });
    f.env.ledger().set_timestamp(T0 + 11);
    assert_eq!(f.client.participate(&hash(&f.env, 1)), Outcome::Expired);
    // The lazy close was written even though the participation was rejected.
    let state = f.client.get_state();
    assert_eq!(state.status, Status::Expired);
    assert_eq!(state.progress_count, 0);
}

#[test]
fn goal_has_precedence_over_expiry() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::Going);
        c.goal_count = 1;
        c.ends_at = T0 + 10;
        c
    });
    // Goal is reached by the record, so it closes as exhausted even if time passes later.
    assert_eq!(f.client.participate(&hash(&f.env, 1)), Outcome::Recorded);
    f.env.ledger().set_timestamp(T0 + 11);
    assert_eq!(f.client.evaluate(), Status::Exhausted);
}

#[test]
fn consumption_by_count_is_idempotent_per_charge() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::Consumption);
        c.goal_count = 2;
        c
    });
    let c1 = hash(&f.env, 1);
    let c2 = hash(&f.env, 2);

    assert_eq!(f.client.apply_consumption(&c1, &10_000), Outcome::Recorded);
    assert_eq!(f.client.apply_consumption(&c1, &10_000), Outcome::AlreadyRecorded);
    assert!(f.client.has_charge(&c1));
    let state = f.client.get_state();
    assert_eq!(state.progress_count, 1);
    assert_eq!(state.progress_amount, 10_000);

    assert_eq!(f.client.apply_consumption(&c2, &5_000), Outcome::Recorded);
    let state = f.client.get_state();
    assert_eq!(state.progress_count, 2);
    assert_eq!(state.progress_amount, 15_000);
    assert_eq!(state.status, Status::Exhausted);
}

#[test]
fn consumption_by_amount_closes_when_total_reached() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::Consumption);
        c.goal_amount = 20_000;
        c
    });
    assert_eq!(f.client.apply_consumption(&hash(&f.env, 1), &12_000), Outcome::Recorded);
    assert_eq!(f.client.get_state().status, Status::Active);
    assert_eq!(f.client.apply_consumption(&hash(&f.env, 2), &8_000), Outcome::Recorded);
    assert_eq!(f.client.get_state().status, Status::Exhausted);
    assert_eq!(
        f.client.apply_consumption(&hash(&f.env, 3), &1_000),
        Outcome::Exhausted
    );
}

#[test]
fn consumption_enforces_min_ticket_without_consuming_quota() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::Consumption);
        c.goal_count = 1;
        c.min_ticket = 5_000;
        c
    });
    assert_eq!(
        f.client.apply_consumption(&hash(&f.env, 1), &4_999),
        Outcome::BelowMinTicket
    );
    assert!(!f.client.has_charge(&hash(&f.env, 1)));
    assert_eq!(f.client.get_state().progress_count, 0);
    assert_eq!(f.client.apply_consumption(&hash(&f.env, 1), &5_000), Outcome::Recorded);
}

#[test]
fn consumption_rejects_non_positive_amount() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::Consumption);
        c.goal_count = 1;
        c
    });
    assert!(f
        .client
        .try_apply_consumption(&hash(&f.env, 1), &0)
        .is_err());
    assert!(f
        .client
        .try_apply_consumption(&hash(&f.env, 1), &-5)
        .is_err());
}

#[test]
fn consumption_and_participation_do_not_cross() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::Consumption);
        c.goal_count = 1;
        c
    });
    assert_eq!(f.client.participate(&hash(&f.env, 1)), Outcome::WrongKind);

    let g = setup(|e| cfg(e, Kind::Going));
    assert_eq!(
        g.client.apply_consumption(&hash(&g.env, 1), &100),
        Outcome::WrongKind
    );
}

#[test]
fn manual_close_marks_exhausted_once() {
    let f = setup(|e| cfg(e, Kind::Going));
    assert_eq!(f.client.close(), Status::Exhausted);
    let closed_at = f.client.get_state().closed_at;
    assert_eq!(closed_at, T0);

    f.env.ledger().set_timestamp(T0 + 500);
    assert_eq!(f.client.close(), Status::Exhausted);
    assert_eq!(f.client.get_state().closed_at, closed_at);
    assert_eq!(f.client.participate(&hash(&f.env, 1)), Outcome::Exhausted);
}

#[test]
fn import_batch_restores_progress_and_dedupes() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::Going);
        c.goal_count = 5;
        c
    });
    let a = hash(&f.env, 1);
    let b = hash(&f.env, 2);

    let total = f
        .client
        .import_batch(&vec![&f.env, a.clone(), b.clone(), a.clone()], &Vec::new(&f.env));
    assert_eq!(total, 2);
    assert_eq!(f.client.participate(&a), Outcome::AlreadyRecorded);
    assert_eq!(f.client.get_state().progress_count, 2);
}

#[test]
fn import_batch_restores_consumption_amounts() {
    let f = setup(|e| {
        let mut c = cfg(e, Kind::Consumption);
        c.goal_amount = 50_000;
        c
    });
    let entries = vec![
        &f.env,
        ChargeEntry { charge_hash: hash(&f.env, 1), amount: 10_000 },
        ChargeEntry { charge_hash: hash(&f.env, 2), amount: 15_000 },
        ChargeEntry { charge_hash: hash(&f.env, 1), amount: 10_000 },
    ];
    f.client.import_batch(&Vec::new(&f.env), &entries);
    let state = f.client.get_state();
    assert_eq!(state.progress_count, 2);
    assert_eq!(state.progress_amount, 25_000);
    assert_eq!(
        f.client.apply_consumption(&hash(&f.env, 1), &10_000),
        Outcome::AlreadyRecorded
    );
}

#[test]
fn mutating_calls_require_admin_auth() {
    let env = Env::default();
    env.ledger().set_timestamp(T0);
    let admin = Address::generate(&env);
    let config = cfg(&env, Kind::Going);
    // No mock_all_auths: the constructor does not need auth, calls do.
    let id = env.register(TonkiDynamic, (admin, config));
    let client = TonkiDynamicClient::new(&env, &id);
    assert!(client.try_participate(&hash(&env, 1)).is_err());
    assert!(client.try_close().is_err());
    // Reads and bump stay open.
    assert_eq!(client.get_state().status, Status::Active);
    client.bump();
}

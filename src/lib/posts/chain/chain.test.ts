import { Keypair, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { Prisma } from "src/generated/prisma/client";
import {
  codeToKind,
  decodeOutcome,
  decodeState,
  encodeConfig,
  kindToCode,
} from "src/lib/posts/chain/codec";
import {
  ChainConfigError,
  isChainKindEnabled,
  readChainConfig,
  readChainKinds,
  readChainMode,
} from "src/lib/posts/chain/config";
import {
  chargeHash,
  configHash,
  fromCentavos,
  participantHash,
  toCentavos,
  toContractConfig,
  type DynamicChainSource,
} from "src/lib/posts/chain/hashes";
import { deploySalt, deriveContractId } from "src/lib/posts/chain/sorobanChain";
import { DYNAMIC_KINDS } from "src/lib/posts/dynamics/constants";

const SECRET = "x".repeat(32);

function source(overrides: Partial<DynamicChainSource> = {}): DynamicChainSource {
  return {
    dynamic_id: "11111111-1111-4111-8111-111111111111",
    kind: "going",
    config: { text: "Voy" },
    goal_count: 10,
    starts_at: null,
    ends_at: null,
    establishment_id: null,
    token: null,
    ...overrides,
  };
}

describe("chain mode and kinds", () => {
  it("defaults to off and ignores unknown values", () => {
    expect(readChainMode({})).toBe("off");
    expect(readChainMode({ DYNAMICS_CHAIN_MODE: "banana" })).toBe("off");
    expect(readChainMode({ DYNAMICS_CHAIN_MODE: " ON " })).toBe("on");
    expect(readChainMode({ DYNAMICS_CHAIN_MODE: "shadow" })).toBe("shadow");
  });

  it("enables every kind by default and filters by list", () => {
    expect(readChainKinds({}).size).toBe(DYNAMIC_KINDS.length);
    expect(readChainKinds({ DYNAMICS_CHAIN_KINDS: "all" }).size).toBe(5);
    const some = readChainKinds({ DYNAMICS_CHAIN_KINDS: "going, qr ,nope" });
    expect([...some].sort()).toEqual(["going", "qr"]);
  });

  it("never enables a kind while the mode is off", () => {
    expect(isChainKindEnabled("going", { DYNAMICS_CHAIN_MODE: "off" })).toBe(false);
    expect(
      isChainKindEnabled("going", {
        DYNAMICS_CHAIN_MODE: "on",
        DYNAMICS_CHAIN_KINDS: "qr",
      })
    ).toBe(false);
    expect(
      isChainKindEnabled("qr", {
        DYNAMICS_CHAIN_MODE: "shadow",
        DYNAMICS_CHAIN_KINDS: "qr",
      })
    ).toBe(true);
  });
});

describe("readChainConfig", () => {
  it("lists every missing server-only setting", () => {
    try {
      readChainConfig({});
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(ChainConfigError);
      expect((error as ChainConfigError).missing).toEqual([
        "DYNAMIC_WASM_HASH",
        "STELLAR_DEPLOYER_SECRET_KEY",
        "DYNAMICS_HASH_SECRET",
      ]);
    }
  });

  it("reads a complete testnet configuration", () => {
    const secret = Keypair.random().secret();
    const config = readChainConfig({
      DYNAMIC_WASM_HASH: "a".repeat(64),
      STELLAR_DEPLOYER_SECRET_KEY: secret,
      DYNAMICS_HASH_SECRET: SECRET,
    });
    expect(config.network).toBe("testnet");
    expect(config.deployerSecret).toBe(secret);
    expect(config.minBalanceXlm).toBe(50);
  });
});

describe("hashes", () => {
  it("separates participants and charges even for the same id", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    expect(participantHash(id)).toHaveLength(32);
    expect(participantHash(id).equals(chargeHash(id))).toBe(false);
    expect(participantHash(id).equals(participantHash(id))).toBe(true);
  });

  it("keys the config hash and hides the promo code from plain hashing", () => {
    const withCode = source({
      kind: "promo_code",
      config: { code: "VERANO10", benefit: "10%" },
      goal_count: 5,
    });
    const a = configHash(withCode, SECRET);
    const b = configHash(withCode, "y".repeat(32));
    expect(a.equals(b)).toBe(false);
    // Key order in config must not change the hash.
    const reordered = source({
      kind: "promo_code",
      config: { benefit: "10%", code: "VERANO10" },
      goal_count: 5,
    });
    expect(configHash(reordered, SECRET).equals(a)).toBe(true);
    const changed = source({
      kind: "promo_code",
      config: { code: "VERANO11", benefit: "10%" },
      goal_count: 5,
    });
    expect(configHash(changed, SECRET).equals(a)).toBe(false);
  });

  it("converts pesos to centavos without float drift", () => {
    expect(toCentavos("0.1")).toBe(BigInt(10));
    expect(toCentavos(new Prisma.Decimal("1234.56"))).toBe(BigInt(123456));
    expect(toCentavos(19.99)).toBe(BigInt(1999));
    expect(fromCentavos(BigInt(123456)).toFixed(2)).toBe("1234.56");
  });

  it("maps consumption by amount to centavos and zero count", () => {
    const config = toContractConfig(
      source({
        kind: "consumption",
        establishment_id: "33333333-3333-4333-8333-333333333333",
        goal_count: null,
        config: {
          text: null,
          goal_mode: "amount",
          goal_amount: "500.00",
          min_ticket: "50.50",
          product_ids: [],
        },
      }),
      SECRET
    );
    expect(config.goalCount).toBe(0);
    expect(config.goalAmount).toBe(BigInt(50000));
    expect(config.minTicket).toBe(BigInt(5050));
  });

  it("maps consumption by count and windows to unix seconds", () => {
    const config = toContractConfig(
      source({
        kind: "consumption",
        goal_count: 3,
        starts_at: new Date("2026-11-11T00:00:00.000Z"),
        ends_at: new Date("2026-11-12T00:00:00.000Z"),
        config: { goal_mode: "count", product_ids: [] },
      }),
      SECRET
    );
    expect(config.goalCount).toBe(3);
    expect(config.goalAmount).toBe(BigInt(0));
    expect(config.startsAt).toBe(BigInt(1_794_355_200));
    expect(config.endsAt).toBe(BigInt(1_794_441_600));
  });
});

describe("codec", () => {
  it("keeps the contract enum order in sync with DYNAMIC_KINDS", () => {
    expect(DYNAMIC_KINDS.map(kindToCode)).toEqual([0, 1, 2, 3, 4]);
    expect(codeToKind(4)).toBe("consumption");
    expect(() => codeToKind(9)).toThrow();
  });

  it("encodes Config as a sorted map the host accepts", () => {
    const encoded = encodeConfig(toContractConfig(source(), SECRET));
    const keys = encoded.map()!.map((entry) => entry.key().sym().toString());
    expect(keys).toEqual([...keys].sort());
    expect(keys).toEqual([
      "config_hash",
      "ends_at",
      "goal_amount",
      "goal_count",
      "kind",
      "min_ticket",
      "starts_at",
    ]);
    const native = scValToNative(encoded) as Record<string, unknown>;
    expect(native.kind).toBe(1);
    expect(native.goal_count).toBe(10);
    expect(native.goal_amount).toBe(BigInt(0));
  });

  it("decodes outcomes and rejects unknown codes", () => {
    expect(decodeOutcome(xdr.ScVal.scvU32(0))).toBe("recorded");
    expect(decodeOutcome(xdr.ScVal.scvU32(6))).toBe("below_min_ticket");
    expect(() => decodeOutcome(xdr.ScVal.scvU32(99))).toThrow();
  });

  it("decodes the contract State struct", () => {
    const admin = Keypair.random().publicKey();
    const value = nativeToScVal(
      {
        admin,
        config: {
          kind: 4,
          goal_count: 0,
          goal_amount: BigInt(50000),
          min_ticket: BigInt(5000),
          starts_at: BigInt(0),
          ends_at: BigInt(1_794_441_600),
          config_hash: Buffer.alloc(32, 7),
        },
        status: 1,
        progress_count: 3,
        progress_amount: BigInt(52000),
        closed_at: BigInt(1_794_400_000),
      },
      {
        type: {
          admin: ["symbol", "address"],
          config: [
            "symbol",
            {
              kind: ["symbol", "u32"],
              goal_count: ["symbol", "u32"],
              goal_amount: ["symbol", "i128"],
              min_ticket: ["symbol", "i128"],
              starts_at: ["symbol", "u64"],
              ends_at: ["symbol", "u64"],
              config_hash: ["symbol", null],
            },
          ],
          status: ["symbol", "u32"],
          progress_count: ["symbol", "u32"],
          progress_amount: ["symbol", "i128"],
          closed_at: ["symbol", "u64"],
        },
      }
    );
    const state = decodeState(value);
    expect(state.admin).toBe(admin);
    expect(state.kind).toBe("consumption");
    expect(state.status).toBe("exhausted");
    expect(state.goalAmount).toBe(BigInt(50000));
    expect(state.progressAmount).toBe(BigInt(52000));
    expect(state.configHash).toBe("07".repeat(32));
  });
});

describe("deploy addressing", () => {
  const deployer = Keypair.random().publicKey();
  const passphrase = "Test SDF Network ; September 2015";

  it("derives a stable contract address per dynamic and config", () => {
    const hashA = configHash(source(), SECRET).toString("hex");
    const saltA = deploySalt(source(), hashA);
    const idA = deriveContractId(deployer, saltA, passphrase);
    expect(idA).toMatch(/^C[A-Z2-7]{55}$/);
    expect(deriveContractId(deployer, saltA, passphrase)).toBe(idA);

    const edited = source({ goal_count: 11 });
    const hashB = configHash(edited, SECRET).toString("hex");
    const idB = deriveContractId(deployer, deploySalt(edited, hashB), passphrase);
    expect(idB).not.toBe(idA);
  });

  it("changes address per network", () => {
    const salt = deploySalt(source(), "00");
    expect(deriveContractId(deployer, salt, passphrase)).not.toBe(
      deriveContractId(
        deployer,
        salt,
        "Public Global Stellar Network ; September 2015"
      )
    );
  });
});

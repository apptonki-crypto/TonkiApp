import bcrypt from "bcrypt";

import prisma from "src/lib/db";
import {
  businessRegisterSchema,
  resolveBusinessCategory,
  type BusinessRegisterInput,
} from "src/lib/business/schemas";
import { BusinessRegisterStageError } from "src/lib/business/registerBusinessLogger";
import type { BusinessHours, BusinessRegisterResponse } from "src/types/business";

export type RegisterBusinessResult =
  | { ok: true; data: BusinessRegisterResponse }
  | { ok: false; error: string; status: number };

export async function registerBusinessAccount(
  raw: unknown
): Promise<RegisterBusinessResult> {
  const parsed = businessRegisterSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "datos incompletos";
    return { ok: false, error: first, status: 400 };
  }

  return createBusinessAccount(parsed.data);
}

async function createBusinessAccount(
  input: BusinessRegisterInput
): Promise<RegisterBusinessResult> {
  const {
    businessName,
    adminName,
    businessType,
    customBusinessType,
    email,
    phone,
    hours,
    password,
  } = input;

  const emailNormalized = email.toLowerCase();
  const category = resolveBusinessCategory(businessType, customBusinessType);

  const existingUser = await runStage("user_lookup", () =>
    prisma.user.findFirst({
      where: { email: emailNormalized },
      select: { user_id: true },
    })
  );
  if (existingUser) {
    return {
      ok: false,
      error: "Ya existe una cuenta con este correo",
      status: 409,
    };
  }

  const existingCredential = await runStage("credential_lookup", () =>
    prisma.credential.findUnique({
      where: { username: emailNormalized },
      select: { credential_id: true },
    })
  );
  if (existingCredential) {
    return {
      ok: false,
      error: "Ya existe una cuenta con este correo",
      status: 409,
    };
  }

  const passwordHash = await runStage("password_hash", () =>
    bcrypt.hash(password, 10)
  );

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await runStage("create_user", () =>
        tx.user.create({
          data: {
            name: adminName,
            email: emailNormalized,
            type: "admin",
            status: "active",
          },
        })
      );

      await runStage("create_credential", () =>
        tx.credential.create({
          data: {
            user_id: user.user_id,
            username: emailNormalized,
            password_hash: passwordHash,
          },
        })
      );

      const establishment = await runStage("create_establishment", () =>
        tx.establishment.create({
          data: {
            admin_id: user.user_id,
            name: businessName,
            category,
            phone,
            hours,
          },
        })
      );

      return { user, establishment };
    });

    const data: BusinessRegisterResponse = {
      message: "Cuenta empresarial creada",
      user: {
        id: result.user.user_id,
        email: result.user.email!,
        name: result.user.name,
        role: "admin",
      },
      establishment: {
        id: result.establishment.establishment_id,
        name: result.establishment.name,
        category: result.establishment.category ?? category,
        phone: result.establishment.phone,
        hours: result.establishment.hours as BusinessHours,
      },
      redirectTo: "/admin/dashboard",
    };

    return { ok: true, data };
  } catch (err) {
    const code = prismaCode(err);
    if (code === "P2002") {
      return {
        ok: false,
        error: "Ya existe una cuenta con este correo",
        status: 409,
      };
    }
    throw err;
  }
}

/** Runs a single step and, on failure, tags the error with the stage that raised it. */
async function runStage<T>(
  stage: ConstructorParameters<typeof BusinessRegisterStageError>[0],
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BusinessRegisterStageError) throw err;
    throw new BusinessRegisterStageError(stage, err);
  }
}

function prismaCode(err: unknown): string | undefined {
  const cause = err instanceof BusinessRegisterStageError ? err.cause : err;
  if (cause && typeof cause === "object" && "code" in cause) {
    return String((cause as { code: unknown }).code);
  }
  return undefined;
}

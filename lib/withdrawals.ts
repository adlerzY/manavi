import "server-only";
import { randomBytes } from "crypto";
import type { LedgerOwnerType, Prisma, WithdrawalEventType, WithdrawalResponseStatus, WithdrawalStatus } from "@prisma/client";
import { prisma } from "./prisma";
import type { SessionUser } from "./auth";
import { holdEarnings, releaseEarnings, settleEarnings, InsufficientEarningsError, type EarningsOwner, type EarningsOwnerType } from "./earnings";
import { createNotifications } from "./notifications";
import { createPrivateReadUrl } from "./s3";
import { formatCardNumber, maskCardNumber } from "./card";
import {
  LEDGER_PAGE_SIZE,
  WITHDRAWAL_PAGE_SIZE,
  type EarningsAccountView,
  type EarningsOverviewData,
  type LedgerRowView,
  type PayoutCardView,
  type WithdrawalView,
} from "./withdrawal-types";

export class WithdrawalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WithdrawalError";
  }
}

export interface Actor {
  id: string;
  role: string;
}

export interface PayoutTerms {
  coinValueToman: number;
  minCoins: number;
  explicitValueToman: number;
}

const TX = { timeout: 15_000, maxWait: 5_000 };
const OPEN_STATUSES: WithdrawalStatus[] = ["PENDING", "PROCESSING"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECEIPT_KEY_PATTERN = /^private\/withdrawals\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.webp$/i;
const OPEN_REQUEST_MESSAGE = "برای این حساب یک درخواست تسویه در جریان دارید؛ بعد از پایان آن می‌توانید درخواست جدید ثبت کنید";
const STALE_MESSAGE = "وضعیت درخواست تغییر کرده است — صفحه را به‌روزرسانی کنید";
const FILTER_STATUSES = new Set<string>(["PENDING", "PROCESSING", "PAID", "REJECTED", "CANCELLED"]);

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002");
}

function generateCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `W-${code}`;
}

function asOwnerType(value: LedgerOwnerType): EarningsOwnerType {
  if (value !== "USER" && value !== "PUBLISHER") throw new WithdrawalError("نوع حساب نامعتبر است");
  return value;
}

function unitsToToman(units: bigint, coinValueToman: number): bigint {
  return (units * BigInt(coinValueToman)) / 100n;
}

function displayName(user: { firstName: string; username: string | null }): string {
  return user.username ? `@${user.username}` : user.firstName;
}

async function addEvent(
  tx: Prisma.TransactionClient,
  withdrawalId: string,
  type: WithdrawalEventType,
  actor: Actor | null,
  note: string | null
): Promise<void> {
  await tx.withdrawalEvent.create({
    data: { withdrawalId, type, actorId: actor?.id ?? null, actorRole: actor?.role ?? null, note },
  });
}

export async function loadPayoutTerms(): Promise<PayoutTerms> {
  const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
  const fallback = Math.round(Number(settings?.coinPriceUsdt ?? 0) * (settings?.tomanPerUsdt ?? 0));
  const explicit = settings?.payoutCoinValueToman ?? 0;
  return {
    coinValueToman: explicit > 0 ? explicit : fallback,
    minCoins: Math.max(1, settings?.payoutMinCoins ?? 100),
    explicitValueToman: explicit,
  };
}

export async function notifyRequester(requesterId: string, withdrawalId: string, kind: string, title: string, body: string | null): Promise<void> {
  await createNotifications([
    { userId: requesterId, type: "SYSTEM", title, body, href: "/app/earnings", dedupeKey: `withdrawal:${withdrawalId}:${kind}` },
  ]);
}

interface CreateWithdrawalInput {
  requester: SessionUser;
  ownerType: EarningsOwnerType;
  coins: number | null;
  cardId: string;
  note?: string | null;
  idempotencyKey: string;
}

export interface CreateWithdrawalResult {
  id: string;
  code: string;
  coins: number;
  toman: number;
  duplicate: boolean;
}

function toResult(row: { id: string; code: string; amountUnits: bigint; amountToman: bigint }, duplicate: boolean): CreateWithdrawalResult {
  return { id: row.id, code: row.code, coins: Number(row.amountUnits) / 100, toman: Number(row.amountToman), duplicate };
}

export async function createWithdrawal(input: CreateWithdrawalInput): Promise<CreateWithdrawalResult> {
  const { requester } = input;

  const replay = await prisma.withdrawalRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (replay) {
    if (replay.requesterId !== requester.id) throw new WithdrawalError("کلید تکرار نامعتبر است");
    return toResult(replay, true);
  }

  if (requester.isBanned || requester.deletedAt) throw new WithdrawalError("حساب شما مسدود است");

  const ownerId = input.ownerType === "USER" ? requester.id : requester.publisherProfile?.id ?? null;
  if (!ownerId) throw new WithdrawalError("دسترسی به این حساب را ندارید");
  const owner: EarningsOwner = { ownerType: input.ownerType, ownerId };

  const card = await prisma.payoutCard.findFirst({ where: { id: input.cardId, userId: requester.id } });
  if (!card) throw new WithdrawalError("کارت انتخاب‌شده معتبر نیست");

  const terms = await loadPayoutTerms();
  if (terms.coinValueToman <= 0) throw new WithdrawalError("تسویه‌حساب هنوز توسط مدیریت فعال نشده است");

  const note = input.note?.trim().slice(0, 300) || null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateCode();
    try {
      const created = await prisma.$transaction(async (tx) => {
        const account = await tx.earningsAccount.findUnique({ where: { ownerType_ownerId: owner } });
        if (!account || account.balanceUnits <= 0n) throw new WithdrawalError("موجودی قابل تسویه‌ای ندارید");

        const open = await tx.withdrawalRequest.findFirst({
          where: { accountId: account.id, status: { in: OPEN_STATUSES } },
          select: { id: true },
        });
        if (open) throw new WithdrawalError(OPEN_REQUEST_MESSAGE);

        const recentCancelled = await tx.withdrawalRequest.count({
          where: { accountId: account.id, status: "CANCELLED", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        });
        if (recentCancelled >= 3) {
          throw new WithdrawalError("به‌دلیل لغوهای پی‌درپی، ثبت درخواست جدید برای این حساب تا ۲۴ ساعت محدود شده است");
        }
        const minUnits = BigInt(terms.minCoins) * 100n;
        const units = input.coins === null ? account.balanceUnits : BigInt(input.coins) * 100n;
        if (units < minUnits) throw new WithdrawalError(`حداقل مقدار تسویه ${terms.minCoins.toLocaleString("fa-IR")} سکه است`);
        if (units > account.balanceUnits) throw new WithdrawalError("مقدار درخواستی از موجودی شما بیشتر است");

        const amountToman = unitsToToman(units, terms.coinValueToman);
        if (amountToman <= 0n) throw new WithdrawalError("مبلغ درخواست بسیار کم است");

        const request = await tx.withdrawalRequest.create({
          data: {
            code,
            accountId: account.id,
            requesterId: requester.id,
            ownerType: owner.ownerType,
            ownerId,
            amountUnits: units,
            coinValueToman: terms.coinValueToman,
            amountToman,
            cardHolder: card.holderName,
            cardNumber: card.cardNumber,
            iban: card.iban,
            requesterNote: note,
            idempotencyKey: input.idempotencyKey,
          },
        });

        await holdEarnings(tx, owner, units, { sourceType: "WITHDRAWAL", sourceId: request.id });
        await addEvent(tx, request.id, "CREATED", { id: requester.id, role: requester.role }, note);
        return request;
      }, TX);
      return toResult(created, false);
    } catch (err) {
      if (err instanceof InsufficientEarningsError) throw new WithdrawalError("موجودی شما تغییر کرده است — دوباره تلاش کنید");
      if (!isUniqueViolation(err)) throw err;

      const again = await prisma.withdrawalRequest.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (again && again.requesterId === requester.id) return toResult(again, true);

      const open = await prisma.withdrawalRequest.findFirst({
        where: { ownerType: owner.ownerType, ownerId, status: { in: OPEN_STATUSES } },
        select: { id: true },
      });
      if (open) throw new WithdrawalError(OPEN_REQUEST_MESSAGE);
    }
  }
  throw new WithdrawalError("ثبت درخواست ناموفق بود — دوباره تلاش کنید");
}

export async function cancelWithdrawal(id: string, actor: Actor): Promise<{ code: string }> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id } });
    if (!request || request.requesterId !== actor.id) throw new WithdrawalError("درخواست یافت نشد");
    if (request.status === "PROCESSING") throw new WithdrawalError("درخواست در حال پرداخت است و دیگر قابل لغو نیست");
    if (request.status !== "PENDING") throw new WithdrawalError("این درخواست دیگر قابل لغو نیست");

    const updated = await tx.withdrawalRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (updated.count === 0) throw new WithdrawalError(STALE_MESSAGE);

    await releaseEarnings(tx, { ownerType: asOwnerType(request.ownerType), ownerId: request.ownerId }, request.amountUnits, {
      sourceType: "WITHDRAWAL",
      sourceId: id,
    });
    await addEvent(tx, id, "CANCELLED", actor, null);
    return { code: request.code };
  }, TX);
}

export async function startWithdrawalReview(id: string, admin: Actor): Promise<{ requesterId: string; code: string }> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id }, select: { requesterId: true, code: true } });
    if (!request) throw new WithdrawalError("درخواست یافت نشد");

    const updated = await tx.withdrawalRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "PROCESSING", processedById: admin.id, processedAt: new Date() },
    });
    if (updated.count === 0) throw new WithdrawalError(STALE_MESSAGE);

    await addEvent(tx, id, "PROCESSING", admin, null);
    return request;
  }, TX);
}

export async function markWithdrawalPaid(input: {
  id: string;
  admin: Actor;
  receiptKey: string;
  reference?: string | null;
  note?: string | null;
}): Promise<{ requesterId: string; code: string; coins: number; toman: number }> {
  const match = RECEIPT_KEY_PATTERN.exec(input.receiptKey);
  if (!match || match[1].toLowerCase() !== input.id.toLowerCase()) throw new WithdrawalError("فایل رسید نامعتبر است");

  const reference = input.reference?.trim().slice(0, 120) || null;
  const note = input.note?.trim().slice(0, 300) || null;

  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id: input.id } });
    if (!request) throw new WithdrawalError("درخواست یافت نشد");

    const updated = await tx.withdrawalRequest.updateMany({
      where: { id: input.id, status: { in: OPEN_STATUSES } },
      data: {
        status: "PAID",
        paidAt: new Date(),
        processedById: input.admin.id,
        processedAt: request.processedAt ?? new Date(),
        receiptKey: input.receiptKey,
        paymentReference: reference,
        adminNote: note,
      },
    });
    if (updated.count === 0) throw new WithdrawalError(STALE_MESSAGE);

    await settleEarnings(tx, { ownerType: asOwnerType(request.ownerType), ownerId: request.ownerId }, request.amountUnits, {
      sourceType: "WITHDRAWAL",
      sourceId: input.id,
    });
    await addEvent(tx, input.id, "PAID", input.admin, note);

    return {
      requesterId: request.requesterId,
      code: request.code,
      coins: Number(request.amountUnits) / 100,
      toman: Number(request.amountToman),
    };
  }, TX);
}

export async function rejectWithdrawal(input: { id: string; admin: Actor; reason: string }): Promise<{ requesterId: string; code: string; reason: string }> {
  const reason = input.reason.trim().slice(0, 300);
  if (reason.length < 3) throw new WithdrawalError("دلیل رد را بنویسید");

  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id: input.id } });
    if (!request) throw new WithdrawalError("درخواست یافت نشد");

    const updated = await tx.withdrawalRequest.updateMany({
      where: { id: input.id, status: { in: OPEN_STATUSES } },
      data: { status: "REJECTED", adminNote: reason, processedById: input.admin.id, processedAt: new Date() },
    });
    if (updated.count === 0) throw new WithdrawalError(STALE_MESSAGE);

    await releaseEarnings(tx, { ownerType: asOwnerType(request.ownerType), ownerId: request.ownerId }, request.amountUnits, {
      sourceType: "WITHDRAWAL",
      sourceId: input.id,
    });
    await addEvent(tx, input.id, "REJECTED", input.admin, reason);
    return { requesterId: request.requesterId, code: request.code, reason };
  }, TX);
}

export async function respondToWithdrawal(input: {
  id: string;
  actor: Actor;
  status: WithdrawalResponseStatus;
  note?: string | null;
}): Promise<{ code: string }> {
  const note = input.note?.trim().slice(0, 500) || null;
  if (input.status === "DISPUTED" && !note) throw new WithdrawalError("برای ثبت مغایرت توضیح بنویسید");

  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id: input.id } });
    if (!request || request.requesterId !== input.actor.id) throw new WithdrawalError("درخواست یافت نشد");
    if (request.status !== "PAID") throw new WithdrawalError("این درخواست هنوز پرداخت نشده است");

    const updated = await tx.withdrawalRequest.updateMany({
      where: { id: input.id, status: "PAID", response: null },
      data: { response: input.status, responseNote: note, respondedAt: new Date() },
    });
    if (updated.count === 0) throw new WithdrawalError("قبلاً برای این پرداخت پاسخ ثبت کرده‌اید");

    await addEvent(tx, input.id, input.status === "CONFIRMED" ? "CONFIRMED" : "DISPUTED", input.actor, note);
    return { code: request.code };
  }, TX);
}

export async function resolveWithdrawalDispute(input: { id: string; admin: Actor; resolution: string }): Promise<{ requesterId: string; code: string }> {
  const resolution = input.resolution.trim().slice(0, 500);
  if (resolution.length < 3) throw new WithdrawalError("توضیح پاسخ را بنویسید");

  return prisma.$transaction(async (tx) => {
    const request = await tx.withdrawalRequest.findUnique({ where: { id: input.id }, select: { requesterId: true, code: true } });
    if (!request) throw new WithdrawalError("درخواست یافت نشد");

    const updated = await tx.withdrawalRequest.updateMany({
      where: { id: input.id, response: "DISPUTED", disputeResolvedAt: null },
      data: { disputeResolvedAt: new Date(), disputeResolution: resolution },
    });
    if (updated.count === 0) throw new WithdrawalError("مغایرت فعالی برای این درخواست وجود ندارد");

    await addEvent(tx, input.id, "DISPUTE_RESOLVED", input.admin, resolution);
    return request;
  }, TX);
}

export async function resolveReceiptUrl(id: string, viewer: SessionUser): Promise<string> {
  if (viewer.isBanned) throw new WithdrawalError("دسترسی غیرمجاز");
  const request = await prisma.withdrawalRequest.findUnique({
    where: { id },
    select: { receiptKey: true, requesterId: true, ownerType: true, ownerId: true },
  });
  if (!request) throw new WithdrawalError("درخواست یافت نشد");

  const allowed =
    viewer.role === "ADMIN" ||
    request.requesterId === viewer.id ||
    (request.ownerType === "PUBLISHER" && viewer.publisherProfile?.id === request.ownerId);
  if (!allowed) throw new WithdrawalError("دسترسی غیرمجاز");
  if (!request.receiptKey) throw new WithdrawalError("هنوز رسیدی بارگذاری نشده است");

  return createPrivateReadUrl(request.receiptKey, 600);
}

const ROW_INCLUDE = { events: { orderBy: { createdAt: "asc" } } } satisfies Prisma.WithdrawalRequestInclude;
type WithdrawalRow = Prisma.WithdrawalRequestGetPayload<{ include: typeof ROW_INCLUDE }>;

async function toViews(rows: WithdrawalRow[], adminView: boolean): Promise<WithdrawalView[]> {
  if (rows.length === 0) return [];

  const userIds = new Set<string>();
  const publisherIds = new Set<string>();
  for (const row of rows) {
    userIds.add(row.requesterId);
    if (row.processedById) userIds.add(row.processedById);
    for (const event of row.events) if (event.actorId) userIds.add(event.actorId);
    if (row.ownerType === "PUBLISHER") publisherIds.add(row.ownerId);
  }

  const [users, publishers] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, firstName: true, username: true } }),
    publisherIds.size > 0
      ? prisma.publisher.findMany({ where: { id: { in: [...publisherIds] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const nameById = new Map(users.map((user) => [user.id, displayName(user)]));
  const publisherById = new Map(publishers.map((publisher) => [publisher.id, publisher.name]));

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    ownerType: row.ownerType,
    ownerLabel: row.ownerType === "PUBLISHER" ? `ناشر ${publisherById.get(row.ownerId) ?? ""}`.trim() : "حساب شخصی",
    requesterName: nameById.get(row.requesterId) ?? "—",
    coins: Number(row.amountUnits) / 100,
    coinValueToman: row.coinValueToman,
    amountToman: Number(row.amountToman),
    cardHolder: row.cardHolder,
    cardDisplay: adminView ? formatCardNumber(row.cardNumber) : maskCardNumber(row.cardNumber),
    cardRaw: adminView ? row.cardNumber : "",
    iban: row.iban,
    status: row.status,
    requesterNote: row.requesterNote,
    adminNote: row.adminNote,
    processedByName: row.processedById ? nameById.get(row.processedById) ?? null : null,
    processedAt: row.processedAt ? row.processedAt.toISOString() : null,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    paymentReference: row.paymentReference,
    hasReceipt: Boolean(row.receiptKey),
    response: row.response,
    responseNote: row.responseNote,
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
    disputeResolvedAt: row.disputeResolvedAt ? row.disputeResolvedAt.toISOString() : null,
    disputeResolution: row.disputeResolution,
    createdAt: row.createdAt.toISOString(),
    events: row.events.map((event) => ({
      id: event.id,
      type: event.type,
      actorName: event.actorId ? nameById.get(event.actorId) ?? null : null,
      actorRole: event.actorRole,
      note: event.note,
      createdAt: event.createdAt.toISOString(),
    })),
  }));
}

export async function searchWithdrawals(params: { status?: string; q?: string; page?: number }): Promise<{ withdrawals: WithdrawalView[]; total: number }> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const status = params.status ?? "";
  const q = params.q?.trim().slice(0, 60);

  const where: Prisma.WithdrawalRequestWhereInput = {
    ...(status === "ACTIVE"
      ? { status: { in: OPEN_STATUSES } }
      : status === "DISPUTED"
      ? { response: "DISPUTED", disputeResolvedAt: null }
      : FILTER_STATUSES.has(status)
      ? { status: status as WithdrawalStatus }
      : {}),
  };

  if (q) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
          { username: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true },
      take: 50,
    });
    where.OR = [{ code: { contains: q.toUpperCase() } }, { requesterId: { in: users.map((user) => user.id) } }];
  }

  const [rows, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: { createdAt: status === "ACTIVE" ? "asc" : "desc" },
      skip: (page - 1) * WITHDRAWAL_PAGE_SIZE,
      take: WITHDRAWAL_PAGE_SIZE,
      include: ROW_INCLUDE,
    }),
    prisma.withdrawalRequest.count({ where }),
  ]);

  return { withdrawals: await toViews(rows, true), total };
}

export async function getPayoutSettingsView(): Promise<{ explicitValueToman: number; effectiveValueToman: number; minCoins: number }> {
  const terms = await loadPayoutTerms();
  return { explicitValueToman: terms.explicitValueToman, effectiveValueToman: terms.coinValueToman, minCoins: terms.minCoins };
}

export async function loadEarningsOverview(user: SessionUser): Promise<EarningsOverviewData> {
  const publisherId = user.publisherProfile?.id ?? null;
  const owners: EarningsOwner[] = [
    { ownerType: "USER", ownerId: user.id },
    ...(publisherId ? [{ ownerType: "PUBLISHER" as const, ownerId: publisherId }] : []),
  ];
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [accounts, openRows, monthRows, cards, terms, rows] = await Promise.all([
    prisma.earningsAccount.findMany({ where: { OR: owners } }),
    prisma.withdrawalRequest.findMany({
      where: { status: { in: OPEN_STATUSES }, OR: owners },
      select: { id: true, ownerType: true, ownerId: true, amountUnits: true },
    }),
    prisma.revenueAllocation.groupBy({
      by: ["beneficiaryType", "beneficiaryId"],
      where: {
        createdAt: { gte: monthStart },
        OR: owners.map((owner) => ({ beneficiaryType: owner.ownerType, beneficiaryId: owner.ownerId })),
      },
      _sum: { allocatedUnits: true },
    }),
    prisma.payoutCard.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
    loadPayoutTerms(),
    prisma.withdrawalRequest.findMany({
      where: { OR: [{ requesterId: user.id }, ...(publisherId ? [{ ownerType: "PUBLISHER" as const, ownerId: publisherId }] : [])] },
      orderBy: { createdAt: "desc" },
      take: WITHDRAWAL_PAGE_SIZE,
      include: ROW_INCLUDE,
    }),
  ]);

  const accountViews: EarningsAccountView[] = owners.map((owner) => {
    const account = accounts.find((item) => item.ownerType === owner.ownerType && item.ownerId === owner.ownerId);
    const open = openRows.find((item) => item.ownerType === owner.ownerType && item.ownerId === owner.ownerId);
    const month = monthRows.find((item) => item.beneficiaryType === owner.ownerType && item.beneficiaryId === owner.ownerId);
    return {
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      label: owner.ownerType === "USER" ? "حساب شخصی" : `حساب ناشر — ${user.publisherProfile?.name ?? ""}`,
      balanceCoins: Number(account?.balanceUnits ?? 0n) / 100,
      heldCoins: Number(open?.amountUnits ?? 0n) / 100,
      lifetimeEarnedCoins: Number(account?.lifetimeEarnedUnits ?? 0n) / 100,
      lifetimeWithdrawnCoins: Number(account?.lifetimeWithdrawnUnits ?? 0n) / 100,
      monthEarnedCoins: (month?._sum.allocatedUnits ?? 0) / 100,
      openWithdrawalId: open?.id ?? null,
    };
  });

  const cardViews: PayoutCardView[] = cards.map((card) => ({
    id: card.id,
    holderName: card.holderName,
    cardMasked: maskCardNumber(card.cardNumber),
    iban: card.iban,
    isDefault: card.isDefault,
  }));

  return {
    accounts: accountViews,
    cards: cardViews,
    terms: { coinValueToman: terms.coinValueToman, minCoins: terms.minCoins },
    withdrawals: await toViews(rows, false),
  };
}

const LEDGER_SOURCE_TITLES: Record<string, string> = {
  SALE: "فروش چپتر",
  DONATION: "حمایت مالی دریافتی",
  EARNINGS_OPENING: "موجودی اولیه (انتقال از سیستم قبلی)",
};

export async function loadEarningsLedger(owner: EarningsOwner, page: number): Promise<{ entries: LedgerRowView[]; total: number }> {
  const where: Prisma.LedgerEntryWhereInput = {
    account: "BENEFICIARY_PAYABLE",
    currency: "COIN_UNIT",
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
  };

  const [rows, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * LEDGER_PAGE_SIZE,
      take: LEDGER_PAGE_SIZE,
      select: { id: true, direction: true, amountUnits: true, sourceType: true, sourceId: true, createdAt: true },
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  const saleIds = rows.filter((row) => row.sourceType === "SALE").map((row) => row.sourceId);
  const withdrawalIds = rows.filter((row) => row.sourceType === "WITHDRAWAL").map((row) => row.sourceId);

  const [sales, withdrawals] = await Promise.all([
    saleIds.length > 0
      ? prisma.sale.findMany({
          where: { id: { in: saleIds } },
          select: { id: true, edition: { select: { work: { select: { title: true } } } }, _count: { select: { lines: true } } },
        })
      : Promise.resolve([]),
    withdrawalIds.length > 0
      ? prisma.withdrawalRequest.findMany({ where: { id: { in: withdrawalIds } }, select: { id: true, code: true } })
      : Promise.resolve([]),
  ]);
  const saleById = new Map(sales.map((sale) => [sale.id, sale]));
  const codeById = new Map(withdrawals.map((item) => [item.id, item.code]));

  const entries = rows.map((row) => {
    const units = Number(row.amountUnits) / 100;
    const credit = row.direction === "CREDIT";
    let title = LEDGER_SOURCE_TITLES[row.sourceType] ?? (credit ? "افزایش موجودی" : "کاهش موجودی");
    let detail: string | null = null;

    if (row.sourceType === "SALE") {
      const sale = saleById.get(row.sourceId);
      if (sale) detail = `${sale.edition.work.title} · ${sale._count.lines.toLocaleString("fa-IR")} چپتر`;
    } else if (row.sourceType === "WITHDRAWAL") {
      title = credit ? "بازگشت مبلغ درخواست تسویه" : "درخواست تسویه‌حساب";
      detail = codeById.get(row.sourceId) ?? null;
    }

    return { id: row.id, title, detail, coins: credit ? units : -units, createdAt: row.createdAt.toISOString() };
  });

  return { entries, total };
}
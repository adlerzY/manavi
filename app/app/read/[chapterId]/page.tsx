import { notFound } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { isLicenseCurrentlyActive } from "@/lib/license";
import { getChapterAccessList, userHasChapterAccess } from "@/lib/chapters";
import { getSignedImageUrls } from "@/lib/s3";
import { recordChapterVisit } from "@/lib/analytics";
import { getChapterUnlockCoinCost } from "@/lib/platform-settings";
import { ChapterReader } from "@/components/reader/chapter-reader";
import { LockedChapterGate } from "@/components/reader/locked-chapter-gate";
import { AgeVerificationGate } from "@/components/reader/age-verification-gate";
import { CommentSection } from "@/components/comments/comment-section";
import { getChapterReactionSummary } from "@/app/actions/reactions";
import { categoryDirectionToReaderDirection } from "@/lib/reading";
import { TonConnectProvider } from "@/components/providers/ton-connect-provider";
import type { StaffCreditItem } from "@/components/reader/chapter-staff-credits";

interface PageProps {
  params: Promise<{ chapterId: string }>;
}

export default async function ReadChapterPage({ params }: PageProps) {
  const { chapterId } = await params;

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      id: true,
      chapterNumber: true,
      title: true,
      pages: true,
      publishedAt: true,
      accessType: true,
      isLocked: true,
      comic: {
        select: {
          id: true,
          title: true,
          slug: true,
          readingMode: true,
          ageRating: true,
          approvalStatus: true,
          createdById: true,
          category: { select: { readingDirection: true } },
          license: {
            select: {
              publisherId: true,
              status: true,
              terminatedAt: true,
              startDate: true,
              endDate: true,
            },
          },
        },
      },
    },
  });

  if (!chapter || !chapter.publishedAt) {
    notFound();
  }

  if (!isLicenseCurrentlyActive(chapter.comic.license)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-text-muted">این عنوان موقتاً در دسترس نیست.</p>
      </div>
    );
  }

  const [user, accessList] = await Promise.all([
    getSessionUser(),
    getChapterAccessList(chapter.comic.id),
  ]);

  const needsPrivilegeCheck = chapter.isLocked || chapter.comic.approvalStatus !== "APPROVED";
  let isPrivileged = false;
  let isTeamMember = false;
  if (needsPrivilegeCheck) {
    isPrivileged = user?.role === "ADMIN" || user?.id === chapter.comic.createdById;
    if (!isPrivileged && user) {
      const ownContext = await getPublisherContext(user);
      isTeamMember = ownContext?.publisherId === chapter.comic.license.publisherId;
    }
  }

  if (chapter.isLocked && !isPrivileged && !isTeamMember) {
    notFound();
  }

  if (chapter.comic.approvalStatus !== "APPROVED" && !isPrivileged && !isTeamMember) {
    notFound();
  }

  if (user?.isBanned) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-lg font-medium text-text-main">دسترسی شما مسدود شده است</p>
        <p className="max-w-sm text-sm text-text-muted">
          حساب شما به دلیل نقض قوانین استفاده مسدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.
        </p>
      </div>
    );
  }

  const isAdultContent = chapter.comic.ageRating !== "NORMAL";
  if (isAdultContent && !user?.isAgeVerified) {
    return <AgeVerificationGate isAuthenticated={Boolean(user)} />;
  }

  const showAd = chapter.accessType === "FREE";

  const entry = accessList.find((c) => c.id === chapterId);
  const locked = entry?.locked ?? false;

  if (locked) {
    const hasAccess = await userHasChapterAccess(user?.id ?? null, chapterId, user?.role);
    if (!hasAccess) {
      const coinCost = await getChapterUnlockCoinCost();
      return (
        <LockedChapterGate
          chapterId={chapterId}
          comicSlug={chapter.comic.slug}
          coinsBalance={user?.coinsBalance ?? 0}
          coinCost={coinCost}
        />
      );
    }
  }

  const sortedChapters = [...accessList].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const currentIndex = sortedChapters.findIndex((c) => c.id === chapterId);
  const prevChapterId = currentIndex > 0 ? sortedChapters[currentIndex - 1].id : null;
  const nextChapterId = currentIndex >= 0 && currentIndex < sortedChapters.length - 1 ? sortedChapters[currentIndex + 1].id : null;

  let canReply = user?.role === "ADMIN";
  if (!canReply && user?.publisherProfile) {
    canReply = user.publisherProfile.id === chapter.comic.license.publisherId;
  }
  if (!canReply && user) {
    const staffLink = await prisma.publisherStaff.findFirst({
      where: { userId: user.id, publisherId: chapter.comic.license.publisherId },
      select: { id: true },
    });
    canReply = Boolean(staffLink);
  }

  after(() => recordChapterVisit(chapterId, chapter.comic.id, user?.id ?? null).catch(() => {}));

  const [readHistory, pageUrls, reactionData, comments, staffRows] = await Promise.all([
    user
      ? prisma.readHistory.findUnique({
          where: { userId_comicId: { userId: user.id, comicId: chapter.comic.id } },
          select: { lastChapterId: true, lastPage: true, scrollFraction: true },
        })
      : Promise.resolve(null),
    getSignedImageUrls(chapter.pages, undefined, { width: 960 }),
    getChapterReactionSummary(chapterId, user?.id ?? null),
    prisma.comment.findMany({
      where: { chapterId, parentId: null, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        content: true,
        isSpoiler: true,
        isStaffReply: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, username: true } },
        replies: {
          where: { status: "APPROVED" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            isSpoiler: true,
            isStaffReply: true,
            createdAt: true,
            user: { select: { firstName: true, lastName: true, username: true } },
          },
        },
      },
    }),
    prisma.chapterStaff.findMany({
      where: { chapterId },
      select: {
        roleTitle: true,
        user: { select: { id: true, firstName: true, username: true, cryptoWalletAddress: true } },
      },
    }),
  ]);

  const resumeMatch = readHistory?.lastChapterId === chapter.id;
  const watermarkLabel = user ? (user.username ? `@${user.username}` : `#${user.id.slice(0, 8)}`) : null;

  const staffCredits: StaffCreditItem[] = staffRows.map((s) => ({
    userId: s.user.id,
    firstName: s.user.firstName,
    username: s.user.username,
    roleTitle: s.roleTitle,
    hasWallet: Boolean(s.user.cryptoWalletAddress),
  }));

  return (
    <TonConnectProvider>
      <ChapterReader
        chapterId={chapter.id}
        comicId={chapter.comic.id}
        comicSlug={chapter.comic.slug}
        comicTitle={chapter.comic.title}
        readingDirection={categoryDirectionToReaderDirection(chapter.comic.category.readingDirection)}
        chapterNumber={chapter.chapterNumber}
        pages={pageUrls}
        readingMode={chapter.comic.readingMode}
        prevChapterId={prevChapterId}
        nextChapterId={nextChapterId}
        chapterOptions={sortedChapters.map((c) => ({ id: c.id, chapterNumber: c.chapterNumber, title: c.title }))}
        initialPage={resumeMatch ? readHistory.lastPage : 1}
        initialScrollFraction={resumeMatch ? readHistory.scrollFraction : 0}
        reactionSummary={reactionData.summary}
        initialUserReaction={reactionData.userReaction}
        isAuthenticated={Boolean(user)}
        watermarkLabel={watermarkLabel}
        showAd={showAd}
        staffCredits={staffCredits}
      />
      <div className="bg-background">
        <CommentSection
          chapterId={chapter.id}
          initialComments={comments.map((c) => ({
            ...c,
            createdAt: c.createdAt.toISOString(),
            replies: c.replies.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
          }))}
          canReply={canReply}
        />
      </div>
    </TonConnectProvider>
  );
}
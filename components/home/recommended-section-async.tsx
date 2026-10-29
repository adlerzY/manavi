import type { AgeRating } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { getPersonalizedRecommendations } from "@/lib/recommendations";
import { RecommendedSection } from "./recommended-section";

export async function RecommendedSectionAsync({ allowedRatings }: { allowedRatings: AgeRating[] }) {
  const user = await getSessionUser();
  if (!user) return null;

  const recommendations = await getPersonalizedRecommendations(user.id, allowedRatings, 12);
  if (recommendations.length === 0) return null;

  return <RecommendedSection comics={recommendations} />;
}
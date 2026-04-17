export function extractPreferencesFromMessage(message: string) {
  const text = String(message || "").toLowerCase();

  const profile: any = {
    interests: [],
    preferred_features: [],
  };

  if (text.includes("学生")) profile.interests.push("学生");
  if (text.includes("漫画")) profile.interests.push("漫画");
  if (text.includes("彩色")) profile.interests.push("彩色");
  if (text.includes("笔记") || text.includes("手写")) profile.interests.push("笔记");
  if (text.includes("pdf")) profile.interests.push("pdf");

  if (text.includes("便宜") || text.includes("预算") || text.includes("性价比")) {
    profile.budget = "预算敏感";
  }

  if (text.includes("护眼") || text.includes("暖光")) {
    profile.preferred_features.push("暖光");
  }

  if (text.includes("防水")) {
    profile.preferred_features.push("防水");
  }

  return profile;
}

export function mergeProfile(currentProfile: any, patch: any) {
  const merged = {
    ...currentProfile,
    ...patch,
    interests: Array.from(
      new Set([...(currentProfile?.interests || []), ...(patch?.interests || [])])
    ),
    preferred_features: Array.from(
      new Set([
        ...(currentProfile?.preferred_features || []),
        ...(patch?.preferred_features || []),
      ])
    ),
  };

  return merged;
}

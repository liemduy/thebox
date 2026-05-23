function canUseCloudSync(user, online = navigator.onLine) {
  return Boolean(sb && user?.id && user.id !== "local" && online);
}

async function loadCloudWorkspace(userId) {
  if (!sb || !userId || userId === "local") return null;
  const { data, error } = await withTimeout(
    sb.from(STATE_TABLE).select("data,updated_at").eq("user_id", userId).maybeSingle(),
    CLOUD_READ_TIMEOUT_MS,
    "Workspace load"
  );
  if (error) throw error;
  if (!data?.data) return null;
  return {
    data: data.data,
    updatedAt: data.updated_at
  };
}

async function saveCloudWorkspace(userId, snapshot, updatedAt) {
  if (!sb || !userId || userId === "local") return { skipped: true };
  const result = await withTimeout(
    sb.from(STATE_TABLE).upsert({ user_id: userId, data: snapshot, updated_at: updatedAt }, { onConflict: "user_id" }),
    CLOUD_WRITE_TIMEOUT_MS,
    "Workspace save"
  );
  if (result?.error) throw result.error;
  return result || { ok: true };
}

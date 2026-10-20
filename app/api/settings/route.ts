import { clearSecret, disconnectInstagram, getSettingsDTO, savePolicy, saveSecrets } from "@/lib/db";
import { revokeInstagramAccess } from "@/lib/instagram";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json(getSettingsDTO());
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    autoReply?: boolean;
    publicReply?: boolean;
    privateReply?: boolean;
    minConfidence?: number;
    includePrice?: boolean;
    phone?: string;
    accessToken?: string;
    appSecret?: string;
    igUserId?: string;
    igUsername?: string;
    graphVersion?: string;
    igAppId?: string;
    igAppSecret?: string;
    authMode?: "" | "instagram" | "facebook";
    clearAccessToken?: boolean;
    clearAppSecret?: boolean;
    disconnect?: boolean;
    publicOrigin?: string;
  };
  savePolicy({
    ...(body.autoReply !== undefined ? { autoReply: body.autoReply } : {}),
    ...(body.publicReply !== undefined ? { publicReply: body.publicReply } : {}),
    ...(body.privateReply !== undefined ? { privateReply: body.privateReply } : {}),
    ...(body.minConfidence !== undefined ? { minConfidence: body.minConfidence } : {}),
    ...(body.includePrice !== undefined ? { includePrice: body.includePrice } : {}),
    ...(body.phone !== undefined ? { phone: body.phone } : {}),
  });
  if (body.disconnect) {
    await revokeInstagramAccess();
    disconnectInstagram();
    return Response.json(getSettingsDTO());
  }
  if (body.clearAccessToken) clearSecret("accessToken");
  if (body.clearAppSecret) clearSecret("appSecret");
  saveSecrets({
    accessToken: body.accessToken,
    appSecret: body.appSecret,
    igUserId: body.igUserId,
    igUsername: body.igUsername,
    graphVersion: body.graphVersion,
    igAppId: body.igAppId,
    igAppSecret: body.igAppSecret,
    authMode: body.authMode,
    publicOrigin: body.publicOrigin,
  });
  return Response.json(getSettingsDTO());
}

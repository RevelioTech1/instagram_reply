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
    siteLink?: string;
    address?: string;
    timetable?: string;
    publicTemplate?: string;
    privateTemplate?: string;
    dmClosedTemplate?: string;
    priceSymbols?: string[];
    reactToPraise?: boolean;
    praiseReplies?: string[];
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
    ...(body.siteLink !== undefined ? { siteLink: body.siteLink } : {}),
    ...(body.address !== undefined ? { address: body.address } : {}),
    ...(body.timetable !== undefined ? { timetable: body.timetable } : {}),
    ...(body.publicTemplate !== undefined ? { publicTemplate: body.publicTemplate } : {}),
    ...(body.privateTemplate !== undefined ? { privateTemplate: body.privateTemplate } : {}),
    ...(body.dmClosedTemplate !== undefined ? { dmClosedTemplate: body.dmClosedTemplate } : {}),
    ...(body.priceSymbols !== undefined ? { priceSymbols: body.priceSymbols } : {}),
    ...(body.reactToPraise !== undefined ? { reactToPraise: body.reactToPraise } : {}),
    ...(body.praiseReplies !== undefined ? { praiseReplies: body.praiseReplies } : {}),
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

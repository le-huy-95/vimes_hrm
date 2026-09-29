import { SignJWT } from "jose";
import { getJwtSecret, sha256, randomToken } from "@manage-teams/lib";
import { prismaRead, prismaWrite } from "@manage-teams/db";

const jwtSecret = getJwtSecret();

export async function issueTokens(user: {
  id: string;
  email: string;
  token_version: number;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const accessToken = await new SignJWT({
    sub: user.id,
    email: user.email,
    tv: user.token_version,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(jwtSecret);

  const refresh = randomToken();
  const refreshHash = sha256(refresh);
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60_000);
  await prismaWrite.refreshToken.create({
    data: { userId: user.id, tokenHash: refreshHash, expiresAt: expires },
  });
  return { accessToken, refreshToken: refresh, expiresIn: 900 };
}

export { jwtSecret };

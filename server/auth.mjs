import { randomBytes, createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";

const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
const random = () => randomBytes(32).toString("base64url");
export class ChatGPTAuth {
  constructor(directory, port) {
    this.file = join(directory, "chatgpt-credentials.json");
    this.hostFile = join(directory, "agent-host.json");
    this.callback = `http://127.0.0.1:${port}/auth/callback`;
    this.pending = null;
    this.refreshing = null;
  }
  async read() {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  }
  async save(value) {
    const temporary = this.file + ".tmp";
    await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await rename(temporary, this.file);
  }
  async discovery() {
    if (!this.metadata) {
      const r = await fetch(`${issuer}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw new Error("无法获取 ChatGPT 登录配置");
      this.metadata = await r.json();
      if (this.metadata.issuer !== issuer)
        throw new Error("登录服务来源不匹配");
    }
    return this.metadata;
  }
  async begin() {
    let host;
    try {
      host = JSON.parse(await readFile(this.hostFile, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      host = { id: `urn:uuid:${randomUUID()}` };
      await writeFile(this.hostFile, JSON.stringify(host), { mode: 0o600 });
    }
    const saved = await this.read(),
      state = random(),
      nonce = random(),
      verifier = random();
    this.pending = {
      state,
      nonce,
      verifier,
      clientId: saved?.client_id,
      subject: saved?.subject,
      createdAt: Date.now(),
    };
    const params = new URLSearchParams({
      client_id: saved?.client_id || "dynamic_agent_client",
      ext_agent_host_id: host.id,
      response_type: "code",
      redirect_uri: this.callback,
      scope:
        "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
      resource,
      state,
      nonce,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    });
    if (!saved?.client_id)
      params.set("agent_name_hint", "PM Interview Workbench");
    return { url: `${issuer}/api/accounts/authorize?${params}` };
  }
  async exchange(params) {
    const pending = this.pending;
    if (
      !pending ||
      Date.now() - pending.createdAt > 10 * 60 * 1000 ||
      params.get("state") !== pending.state
    )
      throw new Error("登录请求已失效，请重新连接");
    this.pending = null;
    if (params.get("error"))
      throw new Error("未完成 ChatGPT 授权，资料仍保存在本机");
    const clientId = params.get("client_id") || pending.clientId;
    if (
      !clientId ||
      clientId === "dynamic_agent_client" ||
      (pending.clientId && pending.clientId !== clientId)
    )
      throw new Error("登录注册信息不匹配");
    const metadata = await this.discovery();
    const r = await fetch(`${issuer}/api/accounts/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code: params.get("code") || "",
        code_verifier: pending.verifier,
        redirect_uri: this.callback,
        resource,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok)
      throw new Error(`ChatGPT 授权交换失败（${r.status}），请重新连接`);
    const tokens = await r.json();
    const { payload } = await jwtVerify(
      tokens.id_token,
      createRemoteJWKSet(new URL(metadata.jwks_uri)),
      { issuer, audience: clientId },
    );
    if (
      payload.nonce !== pending.nonce ||
      (pending.subject && payload.sub !== pending.subject)
    )
      throw new Error("ChatGPT 账户校验失败");
    const scopes = (tokens.scope || "").split(" ");
    if (!scopes.includes("chatgpt.tokens.use.direct"))
      throw new Error("未授权使用 ChatGPT 计划，请重新连接并选择计划用量");
    await this.save({
      ...tokens,
      client_id: clientId,
      subject: payload.sub,
      email: payload.email,
      scopes,
      expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
    });
  }
  async token() {
    const c = await this.read();
    if (!c) throw new Error("请先使用 ChatGPT 登录");
    if (c.expires_at > Date.now() + 60000) return c.access_token;
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.refresh(c);
    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }
  async refresh(c) {
    const r = await fetch(`${issuer}/api/accounts/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: c.client_id,
        refresh_token: c.refresh_token,
        resource,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error("ChatGPT 授权需要重新连接");
    const tokens = await r.json();
    const scopes = tokens.scope ? tokens.scope.split(" ") : c.scopes;
    if (!scopes.includes("chatgpt.tokens.use.direct"))
      throw new Error("ChatGPT 计划授权已取消");
    await this.save({
      ...c,
      ...tokens,
      scopes,
      expires_at: Date.now() + (tokens.expires_in || 3600) * 1000,
    });
    return tokens.access_token;
  }
  async status() {
    const c = await this.read();
    return { connected: !!c, email: c?.email || "", type: "siwc" };
  }
}

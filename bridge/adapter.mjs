// Claude Code : le CLI officiel d'Anthropic, utilisé avec le compte de la
// personne (abonnement Pro/Max, ou sa clé d'API si elle en a configuré une).
//
// Chaque message lance `claude -p` en flux JSON : les outils de Claude Code
// sont coupés (`--tools ""`), la consigne système vient de Locaryn, et rien
// n'est gardé en session. Les événements de limite (`rate_limit`) du flux
// alimentent la jauge du chat.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  dateDe,
  dossierNeutre,
  executerJsonl,
  libelleFenetre,
  ouvrirTerminal,
  sortieDe,
  trouver,
} from "./cli.mjs";

const GATEWAY = process.env.BRIDGE_GATEWAY_DIR || "";

function exe() {
  return trouver("claude", [
    process.env.CLAUDE_CLI_PATH,
    GATEWAY &&
      path.join(
        GATEWAY,
        "node_modules",
        "@anthropic-ai",
        "claude-code",
        "bin",
        process.platform === "win32" ? "claude.exe" : "claude",
      ),
    GATEWAY && path.join(GATEWAY, "node_modules", "@anthropic-ai", "claude-code", "cli.js"),
    path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude"),
    path.join(os.homedir(), ".claude", "local", process.platform === "win32" ? "claude.exe" : "claude"),
  ]);
}

/** Les modèles proposés. Les alias suivent la dernière version de chaque
 *  famille ; les identifiants complets restent disponibles. */
const MODELES = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5", context_length: 200000, description: "Le plus capable" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", context_length: 200000, description: "Rapide et capable" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", context_length: 200000, description: "Le plus rapide" },
  { id: "claude-fable-5-1", name: "Claude Fable 5.1", context_length: 200000, description: "" },
  { id: "opus", name: "Claude Opus (dernier)", context_length: 200000, description: "Alias : la dernière version d'Opus" },
  { id: "sonnet", name: "Claude Sonnet (dernier)", context_length: 200000, description: "Alias" },
  { id: "haiku", name: "Claude Haiku (dernier)", context_length: 200000, description: "Alias" },
];

/** Les dernières limites lues dans le flux, par fenêtre. */
const limites = new Map();
let derniereMaj = null;

function noterLimite(ev) {
  const info = ev.rate_limit_info ?? ev.rateLimitInfo ?? ev.info ?? ev;
  const type = info.rateLimitType ?? info.rate_limit_type ?? info.type ?? "five_hour";
  let pct = info.utilization ?? info.used_percent ?? info.usedPercent ?? null;
  if (typeof pct === "number" && pct <= 1 && info.utilization != null) pct *= 100;
  if (pct == null && info.status === "rejected") pct = 100;
  limites.set(type, {
    id: type,
    label: libelleFenetre(null, type),
    used_percent: typeof pct === "number" ? Math.round(pct * 10) / 10 : null,
    resets_at: dateDe(info.resetsAt ?? info.resets_at ?? null),
    status: info.status ?? null,
  });
  derniereMaj = new Date().toISOString();
}

export default {
  id: "claude-code",
  label: "Claude Code",
  defaultPort: 20131,
  defaultContext: 200000,

  async models() {
    return MODELES;
  },

  async status() {
    const e = exe();
    if (!e) {
      return {
        installed: false,
        logged_in: false,
        detail: "Claude Code n'est pas installé. Locaryn peut l'installer depuis ce dossier, ou installez-le depuis claude.com/code.",
      };
    }
    const r = await sortieDe(e, ["auth", "status"], { timeoutMs: 15000 });
    let v = {};
    try {
      v = JSON.parse(r.out);
    } catch {}
    const connecte = v.loggedIn === true;
    return {
      installed: true,
      logged_in: connecte,
      account: v.email ?? v.account ?? null,
      method: v.authMethod ?? null,
      detail: connecte
        ? `Connecté${v.email ? ` en tant que ${v.email}` : ""}${v.authMethod ? ` (${v.authMethod})` : ""}.`
        : "Pas encore connecté : ouvrez la connexion et suivez les étapes dans le navigateur.",
    };
  },

  async login() {
    const e = exe();
    if (!e) return { ok: false, detail: "Claude Code n'est pas installé." };
    ouvrirTerminal("Claude Code — connexion", e, ["auth", "login"]);
    return {
      ok: true,
      detail: "Une fenêtre s'est ouverte : terminez la connexion dans le navigateur, puis revenez ici.",
    };
  },

  async logout() {
    const e = exe();
    if (!e) return { ok: false };
    await sortieDe(e, ["auth", "logout"]);
    return { ok: true, detail: "Déconnecté." };
  },

  async usage() {
    return {
      plan: null,
      windows: [...limites.values()],
      updated_at: derniereMaj,
      note: limites.size
        ? "Mis à jour à chaque réponse de Claude."
        : "Les limites s'affichent après une première réponse.",
    };
  },

  async run({ model, system, prompt, signal, onDelta }) {
    const e = exe();
    if (!e) throw new Error("Claude Code n'est pas installé.");
    const dir = dossierNeutre("claude-code");
    const fichierSysteme = path.join(dir, `systeme-${process.pid}-${Date.now()}.md`);
    fs.writeFileSync(fichierSysteme, system || "You are a helpful assistant.", "utf8");
    const args = [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--model",
      model,
      "--tools",
      "",
      "--system-prompt-file",
      fichierSysteme,
      "--no-session-persistence",
      "--strict-mcp-config",
    ];
    let texte = "";
    let vuDelta = false;
    let usage = null;
    let erreurResultat = null;
    try {
      const r = await executerJsonl({
        exe: e,
        args,
        entree: prompt,
        cwd: dir,
        signal,
        surLigne: (ev) => {
          const type = String(ev.type ?? "");
          if (type.includes("rate_limit")) {
            noterLimite(ev);
            return;
          }
          if (type === "stream_event") {
            const d = ev.event?.delta;
            if (ev.event?.type === "content_block_delta" && d?.type === "text_delta" && d.text) {
              vuDelta = true;
              texte += d.text;
              onDelta(d.text);
            }
            return;
          }
          if (type === "assistant" && !vuDelta) {
            const t = (ev.message?.content ?? [])
              .filter((c) => c.type === "text")
              .map((c) => c.text)
              .join("");
            if (t) {
              texte += t;
              onDelta(t);
            }
            return;
          }
          if (type === "result") {
            if (ev.is_error) erreurResultat = ev.result || ev.error || "erreur de Claude Code";
            if (!texte && typeof ev.result === "string") {
              texte = ev.result;
              onDelta(texte);
            }
            const u = ev.usage ?? {};
            const entree =
              (u.input_tokens ?? 0) +
              (u.cache_read_input_tokens ?? 0) +
              (u.cache_creation_input_tokens ?? 0);
            usage = {
              prompt_tokens: entree,
              completion_tokens: u.output_tokens ?? 0,
              total_tokens: entree + (u.output_tokens ?? 0),
            };
          }
        },
      });
      if (erreurResultat) {
        if (/log ?in|auth|credential/i.test(String(erreurResultat))) {
          throw new Error(
            "pas connecté : ouvrez Réglages → Compte → Claude Code et cliquez sur « Se connecter ».",
          );
        }
        throw new Error(String(erreurResultat));
      }
      if (!texte && r.code !== 0) {
        const msg = r.stderr.trim().split("\n").slice(-3).join(" ");
        if (/log ?in|auth|credential/i.test(msg)) {
          throw new Error("Claude Code n'est pas connecté : ouvrez Compte → Claude Code et connectez-vous.");
        }
        throw new Error(msg || `Claude Code s'est arrêté (code ${r.code}).`);
      }
      return { text: texte, usage };
    } finally {
      fs.rm(fichierSysteme, { force: true }, () => {});
    }
  },
};

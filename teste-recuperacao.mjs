// Testa a detecção do link de recuperação de senha (src/supabaseClient.js) e a ligação com o App.jsx.
import fs from "node:fs";
let ok = 0, falhas = [];
const t = (nome, cond) => { cond ? ok++ : falhas.push(nome); };
const src = fs.readFileSync("src/supabaseClient.js", "utf8");
const app = fs.readFileSync("src/App.jsx", "utf8");
const m = src.match(/export const abriuPorRecuperacao = (.*);\n/), e = src.match(/export const linkComErro = (.*?);/);
t("regex abriuPorRecuperacao existe", !!m); t("regex linkComErro existe", !!e);
const mk = (hash, search = "") => {
  const f = new Function("hashDoLink", "buscaDoLink", `return [${m[1]}, ${e[1]}];`);
  return f(hash, search);
};
t("hash recovery", mk("#access_token=abc&expires_in=3600&refresh_token=x&token_type=bearer&type=recovery")[0] === true);
t("hash recovery no fim", mk("#access_token=abc&type=recovery")[0] === true);
t("hash signup NÃO é recuperação", mk("#access_token=abc&type=signup")[0] === false);
t("hash vazio", mk("")[0] === false && mk("")[1] === false);
t("busca ?type=recovery (PKCE)", mk("", "?token_hash=a&type=recovery")[0] === true);
t("type=recoveryX não casa", mk("#type=recoveryX")[0] === false);
t("subtype=recovery não casa", mk("#subtype=recovery")[0] === false);
t("link vencido (otp_expired)", mk("#error=access_denied&error_code=otp_expired&error_description=x")[1] === true);
t("login normal sem erro", mk("#/")[1] === false);
t("cliente declara as constantes ANTES de criar o cliente", src.indexOf("abriuPorRecuperacao") < src.indexOf("export const supabase = createClient"));
t("App importa as constantes", /import \{ supabase, abriuPorRecuperacao, linkComErro \}/.test(app));
t("AppInner escuta PASSWORD_RECOVERY", /event === "PASSWORD_RECOVERY"\) setRecuperandoSenha\(true\)/.test(app));
t("tela de nova senha vem ANTES do login/sessão", app.indexOf("if (recuperandoSenha && sessao)") > 0 && app.indexOf("if (recuperandoSenha && sessao)") < app.indexOf("if (sessao === null) {\n    return ("));
t("trava desliga sem sessão", /if \(sessao === null && recuperandoSenha\) setRecuperandoSenha\(false\)/.test(app));
t("AuthScreen aceita modoInicial/aoConcluir", /function AuthScreen\(\{ T, antesDeEntrar, modoInicial = "login", aoConcluir = null/.test(app));
t("senha mínima 8 e confirmação mantidas", /novaSenha\.length < 8/.test(app) && /novaSenha !== confirmarSenha/.test(app));
console.log(`${ok} ok, ${falhas.length} falhas`); if (falhas.length) { console.log(falhas.join("\n")); process.exit(1); }

import { TopNav } from "../components/TopNav";

const CONTACT = import.meta.env.VITE_PRIVACY_EMAIL ?? "privacidade@exemplo.com";
const UPDATED = "05/06/2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm text-zinc-600 dark:text-zinc-300">{children}</div>
    </section>
  );
}

// Política de Privacidade (LGPD). Texto em pt-BR (mercado principal).
export function Privacy() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <TopNav />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold">Política de Privacidade</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Atualizada em {UPDATED}</p>

        <Section title="Quem somos">
          <p>
            O Alfred é um assistente que registra suas compras e gastos a partir de mensagens de
            texto ou fotos de cupons. Esta política descreve como tratamos seus dados, em
            conformidade com a LGPD (Lei nº 13.709/2018).
          </p>
        </Section>

        <Section title="Dados que coletamos">
          <ul className="list-disc pl-5">
            <li>Cadastro: nome, e-mail e, opcionalmente, telefone.</li>
            <li>Identificadores das plataformas (Telegram/WhatsApp/Web) que você usa.</li>
            <li>Dados de compras que você registra: descrição, valor, data, loja, categoria e — quando há cupom — a chave de acesso da NFC-e.</li>
            <li>Conteúdo das mensagens e fotos de cupom que você envia para processamento.</li>
          </ul>
        </Section>

        <Section title="Finalidade e base legal">
          <p>
            Usamos seus dados para <strong>prestar o serviço que você solicita</strong> (registrar e
            consultar seus gastos) — base legal de <em>execução de serviço/contrato</em> — e
            registramos seu <em>consentimento</em> no cadastro. Não vendemos seus dados nem os usamos
            para publicidade de terceiros.
          </p>
        </Section>

        <Section title="Compartilhamento e processadores">
          <p>Para funcionar, o serviço usa provedores que podem processar seus dados:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>IA (extração dos dados):</strong> Google (Gemini) ou OpenAI (GPT) recebem o
              texto/imagem do cupom para extrair os itens e valores.
            </li>
            <li>
              <strong>Login:</strong> WorkOS (autenticação por e-mail).
            </li>
            <li>
              <strong>Hospedagem do banco:</strong> MongoDB Atlas.
            </li>
          </ul>
          <p>
            Alguns desses provedores estão fora do Brasil, o que pode envolver{" "}
            <strong>transferência internacional</strong> de dados, sempre com salvaguardas
            contratuais. Para máxima privacidade, o operador pode configurar OCR self-hosted para não
            enviar imagens a terceiros.
          </p>
        </Section>

        <Section title="Retenção">
          <p>
            Mantemos seus dados enquanto sua conta existir. Ao excluir a conta, apagamos suas compras,
            lembretes e cadastro.
          </p>
        </Section>

        <Section title="Seus direitos">
          <p>Você pode, a qualquer momento:</p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Acessar/portar</strong> seus dados — no painel, ou pelo comando{" "}
              <code>/exportar</code> (CSV) no chat.
            </li>
            <li>
              <strong>Corrigir</strong> lançamentos — <code>/editar</code> e <code>/excluir</code>.
            </li>
            <li>
              <strong>Excluir</strong> tudo — em <strong>Conta → Excluir minha conta</strong>, ou pelo
              comando <code>/excluir_conta CONFIRMAR</code> no chat.
            </li>
          </ul>
        </Section>

        <Section title="Segurança">
          <p>
            Acesso autenticado (JWT), consultas isoladas por usuário e segredos fora do código.
            Nenhum método é 100% infalível, mas adotamos práticas adequadas à sensibilidade dos dados.
          </p>
        </Section>

        <Section title="Contato">
          <p>
            Dúvidas ou solicitações sobre seus dados:{" "}
            <a className="text-brand underline" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            .
          </p>
        </Section>

        <Section title="Alterações">
          <p>
            Podemos atualizar esta política; mudanças relevantes serão informadas no app. A data no
            topo indica a última revisão.
          </p>
        </Section>
      </main>
    </div>
  );
}

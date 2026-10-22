import type { Words } from "../i18n";

// Guides for the notes of a workbench project (data/study workbench/): one standard set of
// headings and variations by project size and type. Each heading comes with a short hint in a
// %%comment%% (faded in the editor, and removed in one go with stripComments), so the notes say
// what goes where without the hint staying in the text.

export const GUIDE_IDS = ["standard", "small", "medium", "large", "poc", "clone"] as const;
export type GuideId = (typeof GUIDE_IDS)[number];

export interface Guide {
  id: GuideId;
  name: Words;
  /** How long it usually takes: "1–3 days". */
  size: Words;
  /** When to pick it. */
  when: Words;
  /** Example projects. */
  examples: Words;
  sections: { title: Words; hint: Words; task?: boolean }[];
}

const w = (en: string, pt: string): Words => ({ en, pt });

const S = {
  goal: { title: w("Goal", "Objetivo"), hint: w("What the project does and what you want to learn with it, in one or two sentences.", "O que o projeto faz e o que você quer aprender com ele, em uma ou duas frases.") },
  requirements: { title: w("Requirements", "Requisitos"), hint: w("What it must do. One line per item; tick it when it works.", "O que ele precisa fazer. Um item por linha; marque quando funcionar."), task: true },
  steps: { title: w("Steps", "Passos"), hint: w("The work in small pieces, in order. Each one fits in a study session.", "O trabalho em partes pequenas, em ordem. Cada uma cabe em uma sessão de estudo."), task: true },
  decisions: { title: w("Decisions", "Decisões"), hint: w("Each choice and why: the library, the database, the folder layout…", "Cada escolha e o porquê: a biblioteca, o banco, a organização das pastas…") },
  problems: { title: w("Problems and solutions", "Problemas e soluções"), hint: w("Errors you hit, what caused them and how you fixed them. Paste the error message.", "Erros que apareceram, a causa e como resolveu. Cole a mensagem de erro.") },
  learned: { title: w("What I learned", "O que aprendi"), hint: w("What you can now do without looking it up. Good material for flashcards.", "O que agora você faz sem consultar. Bom material para flashcards.") },
  io: { title: w("Input and output", "Entrada e saída"), hint: w("What goes in and what should come out. Write one example of each.", "O que entra e o que deve sair. Escreva um exemplo de cada.") },
  users: { title: w("Users and problem", "Usuários e problema"), hint: w("Who uses it and what problem it solves for them.", "Quem usa e que problema resolve para essa pessoa.") },
  moscow: {
    title: w("Requirements (MoSCoW)", "Requisitos (MoSCoW)"),
    hint: w(
      "Must = without it the project fails · Should = important, can wait · Could = nice to have · Won't = left out this time.",
      "Must = sem isso não funciona · Should = importante, pode esperar · Could = seria bom · Won't = fica de fora desta vez.",
    ),
    task: true,
  },
  data: { title: w("Data model", "Modelo de dados"), hint: w("Tables or classes and how they relate. Link the draw.io model above.", "Tabelas ou classes e como se relacionam. Ligue o modelo do draw.io acima.") },
  architecture: { title: w("Architecture", "Arquitetura"), hint: w("Layers (controller, service, repository…) and the technologies of each one.", "Camadas (controller, service, repository…) e as tecnologias de cada uma.") },
  tests: { title: w("Tests", "Testes"), hint: w("What is tested and how (unit, integration, by hand). The cases that broke before.", "O que é testado e como (unitário, integração, manual). Os casos que já quebraram.") },
  vision: { title: w("Vision", "Visão"), hint: w("Where the project wants to get to, for whom, and why it is worth it.", "Aonde o projeto quer chegar, para quem, e por que vale a pena.") },
  mvp: { title: w("MVP scope", "Escopo do MVP"), hint: w("The smallest version that already helps someone. Everything else waits.", "A menor versão que já ajuda alguém. Todo o resto espera.") },
  nonFunctional: { title: w("Non-functional requirements", "Requisitos não funcionais"), hint: w("Performance, security, accessibility, devices, offline…", "Desempenho, segurança, acessibilidade, dispositivos, offline…") },
  c4: { title: w("Architecture (C4)", "Arquitetura (C4)"), hint: w("Context: the system and who talks to it. Containers: app, API, database. Draw both on draw.io.", "Contexto: o sistema e quem fala com ele. Contêineres: app, API, banco. Desenhe os dois no draw.io.") },
  adr: {
    title: w("Decisions (ADR)", "Decisões (ADR)"),
    hint: w("One per decision: ### title, then context, decision, consequences.", "Uma por decisão: ### título, depois contexto, decisão, consequências."),
  },
  milestones: { title: w("Milestones", "Marcos"), hint: w("Deliveries with a date: MVP, first users, version 1…", "Entregas com data: MVP, primeiros usuários, versão 1…"), task: true },
  risks: { title: w("Risks", "Riscos"), hint: w("What can go wrong and what you do if it does.", "O que pode dar errado e o que fazer se acontecer.") },
  deploy: { title: w("Deploy", "Deploy"), hint: w("Where it runs, how to publish a new version, environment variables.", "Onde roda, como publicar uma versão nova, variáveis de ambiente.") },
  retro: { title: w("Retrospective", "Retrospectiva"), hint: w("What went well, what didn't, what you would do differently.", "O que deu certo, o que não deu, o que faria diferente.") },
  question: { title: w("Question", "Pergunta"), hint: w("The one thing this test answers. E.g. \"Does JPA make this simpler than JDBC?\"", "A única coisa que este teste responde. Ex.: \"O JPA deixa isto mais simples que o JDBC?\"") },
  hypothesis: { title: w("Hypothesis", "Hipótese"), hint: w("What you expect to happen, before trying.", "O que você espera que aconteça, antes de testar.") },
  experiment: { title: w("Experiment", "Experimento"), hint: w("The smallest code that answers the question. Throwaway is fine.", "O menor código que responde à pergunta. Pode ser descartável.") },
  results: { title: w("Results", "Resultados"), hint: w("What happened: numbers, errors, screenshots.", "O que aconteceu: números, erros, prints.") },
  conclusion: { title: w("Conclusion", "Conclusão"), hint: w("The answer, and whether you will use it in a real project.", "A resposta, e se vai usar isso em um projeto de verdade.") },
  reference: { title: w("Reference app", "App de referência"), hint: w("Which app you are copying and the link to it.", "Qual app você está copiando e o link dele.") },
  features: { title: w("Features to copy", "Funcionalidades a copiar"), hint: w("Only the ones that teach something new. Tick each one when done.", "Só as que ensinam algo novo. Marque cada uma quando pronta."), task: true },
  leftOut: { title: w("Left out", "O que fica de fora"), hint: w("What the real app has that yours won't (payments, notifications…).", "O que o app real tem e o seu não terá (pagamento, notificações…).") },
  screens: { title: w("Screens", "Telas"), hint: w("The screens in order of use. Prints of the original help.", "As telas na ordem de uso. Prints do original ajudam.") },
  mine: { title: w("What is different in mine", "O que muda na minha versão"), hint: w("Your own touch: a feature, a simpler flow, another stack.", "O seu toque: uma funcionalidade, um fluxo mais simples, outra stack.") },
};

export const GUIDES: Guide[] = [
  {
    id: "standard",
    name: w("Standard", "Padrão"),
    size: w("any size", "qualquer tamanho"),
    when: w("When you don't know yet: the headings that fit almost every project.", "Quando ainda não sabe: os títulos que servem para quase todo projeto."),
    examples: w("Any project", "Qualquer projeto"),
    sections: [S.goal, S.requirements, S.steps, S.decisions, S.problems, S.learned],
  },
  {
    id: "small",
    name: w("Small — exercise or script", "Pequeno — exercício ou script"),
    size: w("hours to 3 days", "horas a 3 dias"),
    when: w("One feature, one file or a few classes, no database.", "Uma funcionalidade, um arquivo ou poucas classes, sem banco."),
    examples: w("CLI calculator, currency converter, file renamer script, a kata like FizzBuzz", "Calculadora no terminal, conversor de moedas, script que renomeia arquivos, kata como FizzBuzz"),
    sections: [S.goal, S.io, S.steps, S.learned],
  },
  {
    id: "medium",
    name: w("Medium — app with data (CRUD)", "Médio — app com dados (CRUD)"),
    size: w("1 to 4 weeks", "1 a 4 semanas"),
    when: w("Screens or an API, a database and a few layers.", "Telas ou uma API, um banco de dados e algumas camadas."),
    examples: w("To-do API with Spring + MySQL, library system with JDBC, expense tracker", "API de tarefas com Spring + MySQL, sistema de biblioteca com JDBC, controle de gastos"),
    sections: [S.goal, S.users, S.moscow, S.data, S.architecture, S.steps, S.decisions, S.tests, S.problems, S.learned],
  },
  {
    id: "large",
    name: w("Large — portfolio or final project", "Grande — portfólio ou TCC"),
    size: w("1 month or more", "1 mês ou mais"),
    when: w("Real users, several parts (app, API, database), deploy.", "Usuários reais, várias partes (app, API, banco), deploy."),
    examples: w("Clinic scheduling system, small e-commerce, college final project", "Sistema de agendamento para clínica, e-commerce pequeno, TCC"),
    sections: [S.vision, S.users, S.mvp, S.moscow, S.nonFunctional, S.c4, S.data, S.adr, S.milestones, S.risks, S.tests, S.deploy, S.retro],
  },
  {
    id: "poc",
    name: w("Proof of concept", "Prova de conceito"),
    size: w("hours to a few days", "horas a poucos dias"),
    when: w("To try a technology or answer one question before using it for real.", "Para testar uma tecnologia ou responder uma pergunta antes de usar de verdade."),
    examples: w("Run the app in Docker, JPA vs JDBC, a first WebSocket chat", "Rodar o app no Docker, JPA vs JDBC, primeiro chat com WebSocket"),
    sections: [S.question, S.hypothesis, S.experiment, S.results, S.conclusion],
  },
  {
    id: "clone",
    name: w("App clone", "Clone de app"),
    size: w("1 to 3 weeks", "1 a 3 semanas"),
    when: w("Rebuilding a known app to learn how it works.", "Refazer um app conhecido para aprender como ele funciona."),
    examples: w("Simple Trello, Twitter timeline, Spotify player screen", "Trello simples, timeline do Twitter, tela do player do Spotify"),
    sections: [S.reference, S.features, S.leftOut, S.screens, S.data, S.steps, S.mine, S.learned],
  },
];

export const guideOf = (id: string) => GUIDES.find(g => g.id === id) ?? GUIDES[0];

/** The notes a guide starts with: each heading, its hint in a %%comment%%, room to write. */
export function guideBody(g: Guide, pick: (w: Words) => string): string {
  return g.sections.map(s => `## ${pick(s.title)}\n\n%% ${pick(s.hint)} %%\n${s.task ? "- [ ] \n" : ""}\n`).join("");
}

/** The text without its %%comments%% (the guide hints), and without the blank lines they leave. */
export function stripComments(body: string): string {
  return body
    .replace(/^[ \t]*%%[\s\S]*?%%[ \t]*(\n|$)/gm, "")
    .replace(/[ \t]*%%[\s\S]*?%%/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

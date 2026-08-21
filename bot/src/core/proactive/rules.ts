import { ProactiveRule } from "./ProactiveRule";
import { TASK_RULES } from "../../modules/tasks/rules";
import { FIN_RULES } from "../../modules/fin/rules";

// Registro das regras proativas, montado a partir dos módulos — como o catálogo de
// comandos. O motor não sabe o que cada regra faz; só sabe compará-las por prioridade.
//
// Módulo novo com regra nova acrescenta aqui, e nada mais muda.
export const PROACTIVE_RULES: ProactiveRule[] = [...TASK_RULES, ...FIN_RULES];

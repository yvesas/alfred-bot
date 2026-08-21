import { Schema, model, Document } from "mongoose";

// Tarefa: uma coisa a fazer, com prazo opcional.
//
// Chaveada pelo `User._id` canônico (ADR-0002), e não por `(platform, externalId)`
// como o `Reminder`. O lembrete é a exceção legada — ele precisa saber **para onde**
// mandar o push, então guarda a plataforma. A tarefa é da pessoa, não do canal: ela
// anota no Telegram e conclui no web.
export interface ITaskBase {
  userId: string; // String(User._id)
  description: string;
  /** Prazo, opcional. Sem ele a tarefa existe mas não vence. */
  dueDate?: Date;
  done: boolean;
  doneAt?: Date;
}

export type ITaskCreate = Omit<ITaskBase, "done" | "doneAt"> & { done?: boolean };

export interface ITask extends ITaskBase, Document {
  createdAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    userId: { type: String, required: true },
    description: { type: String, required: true },
    dueDate: { type: Date },
    done: { type: Boolean, default: false, required: true },
    doneAt: { type: Date },
  },
  { timestamps: true },
);

// Listar as pendentes de um usuário, na ordem em que vencem — é a consulta que a
// listagem e (mais adiante) a proatividade fazem o tempo todo.
TaskSchema.index({ userId: 1, done: 1, dueDate: 1 });

export const TaskModel = model<ITask>("Task", TaskSchema);
